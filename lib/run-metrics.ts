import { metersToFeet, metersToMiles, paceSecondsPerMile } from "@/lib/units";
import type { RunTrainingProfile } from "@/lib/run-tag";
import { MIN_SAMPLES_FOR_ROLLING_ADAPTIVE } from "@/lib/run-tag";

export type RunForMetrics = {
  distanceMeters: number | null;
  movingTimeSec: number | null;
  averageHrBpm: number | null;
  /** Total elevation gain for the activity (meters), when available. */
  totalElevationM?: number | null;
};

export type EffortLevel = "Low" | "Moderate" | "High" | "Very high" | "Max" | "Unclassified";

/** Badge dot + color-mix base for effort pills and the Running page effort key. */
export const EXERTION_LEVEL_COLORS: Record<EffortLevel, string> = {
  Low: "#22c55e",
  Moderate: "#22c55e",
  High: "#f59e0b",
  "Very high": "#ef4444",
  Max: "#a855f7",
  Unclassified: "#94a3b8",
};

export type RunExertion = {
  /** 0–10 normalized (relative to recent training), or null if unknown. */
  score10: number | null;
  level: EffortLevel;
  /** Raw (arbitrary units) before normalization; useful for debugging. */
  raw: number | null;
};

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function percentile(sorted: number[], p: number) {
  if (sorted.length === 0) return 0;
  const idx = clamp(Math.round((p / 100) * (sorted.length - 1)), 0, sorted.length - 1);
  return sorted[idx];
}

/**
 * TRIMP-like cardiovascular load from duration + HR intensity.
 * Normalizes HR against the user's reference max HR.
 */
export function computeRawExertion(args: {
  distanceMeters: number | null;
  movingTimeSec: number | null;
  averageHrBpm: number | null;
  userReferenceMaxHr: number | null;
}): number | null {
  const meters = args.distanceMeters ?? 0;
  const sec = args.movingTimeSec ?? 0;
  const avg = args.averageHrBpm ?? null;
  const ref = args.userReferenceMaxHr ?? null;
  if (!meters || meters <= 0 || !sec || sec <= 0) return null;
  if (!avg || !ref || ref <= 100 || avg <= 60) return null;

  const minutes = sec / 60;
  const intensity = clamp(avg / ref, 0.5, 1.02); // 0.5–~1.0
  const raw = minutes * Math.exp(3.2 * (intensity - 0.6));
  return Number.isFinite(raw) ? raw : null;
}

export type PaceElevationBaselines = {
  /** Typical "easy" pace baseline (sec/mi), from recent training distribution. */
  paceP65SecPerMi: number | null;
  /** Typical hilliness baseline (ft gained per mile), from recent training. */
  elevP75FtPerMi: number | null;
};

export function buildPaceElevationBaselines(args: {
  runs: RunForMetrics[];
  /** Minimum miles to include a run in pace baseline (avoid junk / warmups). */
  minMiles?: number;
}): PaceElevationBaselines {
  const minMiles = args.minMiles ?? 0.9;
  const paceSamples: number[] = [];
  const elevPerMiSamples: number[] = [];

  for (const r of args.runs) {
    const meters = r.distanceMeters ?? 0;
    const sec = r.movingTimeSec ?? 0;
    if (!meters || meters <= 0 || !sec || sec <= 0) continue;
    const mi = metersToMiles(meters);
    if (mi < minMiles) continue;
    const pace = paceSecondsPerMile({ seconds: sec, meters });
    if (pace && Number.isFinite(pace) && pace > 0) paceSamples.push(pace);

    const elevM = r.totalElevationM ?? null;
    if (elevM != null && elevM > 0) {
      const ft = metersToFeet(elevM);
      const perMi = ft / mi;
      if (Number.isFinite(perMi) && perMi > 0) elevPerMiSamples.push(perMi);
    }
  }

  const paceSorted = [...paceSamples].sort((a, b) => a - b);
  const elevSorted = [...elevPerMiSamples].sort((a, b) => a - b);

  return {
    paceP65SecPerMi:
      paceSorted.length >= MIN_SAMPLES_FOR_ROLLING_ADAPTIVE
        ? percentile(paceSorted, 65)
        : null,
    elevP75FtPerMi:
      elevSorted.length >= MIN_SAMPLES_FOR_ROLLING_ADAPTIVE
        ? percentile(elevSorted, 75)
        : null,
  };
}

function paceStressFactor(paceSecPerMi: number, baselineSecPerMi: number | null): number | null {
  if (!baselineSecPerMi || baselineSecPerMi <= 0) return null;
  // Lower sec/mi = faster. Stress rises when you're faster than your easy baseline.
  const speedRatio = clamp(baselineSecPerMi / paceSecPerMi, 0.65, 1.55);
  const t = (speedRatio - 0.65) / (1.55 - 0.65);
  return clamp(t, 0, 1);
}

function elevationStressFactor(elevFtPerMi: number, baselineFtPerMi: number | null): number | null {
  if (elevFtPerMi <= 0) return 0;
  if (!baselineFtPerMi || baselineFtPerMi <= 0) return null;
  const ratio = elevFtPerMi / baselineFtPerMi;
  // Diminishing returns: hills matter, but not linearly forever.
  const stress = Math.sqrt(clamp(ratio, 0, 3));
  return clamp(stress / Math.sqrt(3), 0, 1);
}

export type ExertionWeights = { hr: number; pace: number; elev: number };

export function defaultExertionWeights(hasElevation: boolean): ExertionWeights {
  // Baseline intent: HR dominates, pace is meaningful, elevation is real but smaller.
  if (hasElevation) return { hr: 0.55, pace: 0.30, elev: 0.15 };
  // Rebalance proportionally when elevation is unavailable.
  const hr = 0.55 / (0.55 + 0.3);
  const pace = 0.3 / (0.55 + 0.3);
  return { hr, pace, elev: 0 };
}

/**
 * Composite exertion raw score combining:
 * - cardiovascular load (HR + duration)
 * - pace stress vs your recent baseline
 * - elevation load vs your recent hilliness baseline
 *
 * Weights are proportional to typical impact; missing components are omitted
 * and remaining weights are re-normalized.
 */
export function computeCompositeRawExertion(args: {
  run: RunForMetrics;
  userReferenceMaxHr: number | null;
  baselines: PaceElevationBaselines;
}): number | null {
  const meters = args.run.distanceMeters ?? 0;
  const sec = args.run.movingTimeSec ?? 0;
  if (!meters || meters <= 0 || !sec || sec <= 0) return null;

  const mi = metersToMiles(meters);
  const pace = paceSecondsPerMile({ seconds: sec, meters });
  if (!pace) return null;

  const elevM = args.run.totalElevationM ?? null;
  const elevFt = elevM != null && elevM > 0 ? metersToFeet(elevM) : 0;
  const elevFtPerMi = elevFt > 0 && mi > 0 ? elevFt / mi : 0;

  const hrRaw = computeRawExertion({
    distanceMeters: args.run.distanceMeters,
    movingTimeSec: args.run.movingTimeSec,
    averageHrBpm: args.run.averageHrBpm,
    userReferenceMaxHr: args.userReferenceMaxHr,
  });

  const paceStress = paceStressFactor(pace, args.baselines.paceP65SecPerMi);
  const elevStress = elevationStressFactor(elevFtPerMi, args.baselines.elevP75FtPerMi);

  const hasHillBaseline = elevFtPerMi > 0 && elevStress != null;
  const baseW = defaultExertionWeights(hasHillBaseline);

  const hasHr = hrRaw != null;
  const hasPace = paceStress != null;
  const hasElev = hasHillBaseline;

  let hrW = hasHr ? baseW.hr : 0;
  let paceW = hasPace ? baseW.pace : 0;
  let elevW = hasElev ? baseW.elev : 0;
  const sumW = hrW + paceW + elevW;
  if (sumW <= 0) return null;
  hrW /= sumW;
  paceW /= sumW;
  elevW /= sumW;

  // Pace-only stress channel (minutes scaled by pace stress)
  const minutes = sec / 60;
  const paceChannel = minutes * (paceStress ?? 0) * 6.5;

  // Elevation channel (minutes scaled by hill stress)
  const elevChannel = minutes * (elevStress ?? 0) * 4.0;

  // If HR is missing, fall back to pace+elevation (still comparable within your history)
  if (!hasHr) {
    if (!hasPace && !hasElev) return null;
    const raw = paceChannel * paceW + elevChannel * elevW;
    return Number.isFinite(raw) && raw > 0 ? raw : null;
  }

  const raw =
    hrRaw * hrW +
    paceChannel * paceW +
    elevChannel * elevW;
  return Number.isFinite(raw) && raw > 0 ? raw : null;
}

export type ExertionProfile = {
  p50: number;
  p80: number;
  p95: number;
};

export function buildExertionProfile(raws: number[]): ExertionProfile | null {
  const clean = raws.filter((x) => Number.isFinite(x) && x > 0);
  if (clean.length < MIN_SAMPLES_FOR_ROLLING_ADAPTIVE) return null;
  const sorted = [...clean].sort((a, b) => a - b);
  return {
    p50: percentile(sorted, 50),
    p80: percentile(sorted, 80),
    p95: percentile(sorted, 95),
  };
}

export function normalizeExertion(raw: number, profile: ExertionProfile): number {
  // Map [p50..p95] → roughly [4..10], clamp outliers.
  const span = Math.max(1e-6, profile.p95 - profile.p50);
  const t = (raw - profile.p50) / span;
  return clamp(4 + t * 6, 0, 10);
}

export function exertionLevel(raw: number, profile: ExertionProfile): EffortLevel {
  if (raw <= profile.p50) return "Moderate";
  if (raw <= profile.p80) return "High";
  if (raw <= profile.p95) return "Very high";
  return "Max";
}

export function computeRunExertion(args: {
  run: RunForMetrics;
  userReferenceMaxHr: number | null;
  exertionProfile: ExertionProfile | null;
  baselines: PaceElevationBaselines;
}): RunExertion {
  const raw = computeCompositeRawExertion({
    run: args.run,
    userReferenceMaxHr: args.userReferenceMaxHr,
    baselines: args.baselines,
  });
  if (!raw || !args.exertionProfile) {
    return { score10: null, level: "Unclassified", raw: raw ?? null };
  }
  const score10 = normalizeExertion(raw, args.exertionProfile);
  return { score10, level: exertionLevel(raw, args.exertionProfile), raw };
}

function fmtPace(secPerMi: number) {
  const m = Math.floor(secPerMi / 60);
  const s = Math.round(secPerMi - m * 60);
  return `${m}:${String(s).padStart(2, "0")}/mi`;
}

export type ExertionExplanation = {
  exertion: RunExertion;
  reasons: string[];
  /** One-line summary of how the effort distribution was constructed. */
  thresholdsSummary: string;
};

/**
 * Compute the run's exertion score along with a human-readable explanation of
 * each contributing channel (HR / pace / elevation), the weights actually used
 * after re-normalization, and how the level (Moderate/High/Very high/Max) was
 * decided from the period's percentile profile.
 */
export function explainRunExertion(args: {
  run: RunForMetrics;
  userReferenceMaxHr: number | null;
  exertionProfile: ExertionProfile | null;
  baselines: PaceElevationBaselines;
}): ExertionExplanation {
  const reasons: string[] = [];

  const meters = args.run.distanceMeters ?? 0;
  const sec = args.run.movingTimeSec ?? 0;
  if (!meters || meters <= 0 || !sec || sec <= 0) {
    return {
      exertion: { score10: null, level: "Unclassified", raw: null },
      reasons: ["Missing distance or duration."],
      thresholdsSummary: "No effort score.",
    };
  }

  const minutes = sec / 60;
  const mi = metersToMiles(meters);
  const pace = paceSecondsPerMile({ seconds: sec, meters });
  const elevM = args.run.totalElevationM ?? null;
  const elevFt = elevM != null && elevM > 0 ? metersToFeet(elevM) : 0;
  const elevFtPerMi = elevFt > 0 && mi > 0 ? elevFt / mi : 0;

  const hrRaw = computeRawExertion({
    distanceMeters: args.run.distanceMeters,
    movingTimeSec: args.run.movingTimeSec,
    averageHrBpm: args.run.averageHrBpm,
    userReferenceMaxHr: args.userReferenceMaxHr,
  });
  const paceStress =
    pace != null ? paceStressFactor(pace, args.baselines.paceP65SecPerMi) : null;
  const elevStress = elevationStressFactor(elevFtPerMi, args.baselines.elevP75FtPerMi);

  const hasHillBaseline = elevFtPerMi > 0 && elevStress != null;
  const baseW = defaultExertionWeights(hasHillBaseline);
  const hasHr = hrRaw != null;
  const hasPace = paceStress != null;
  const hasElev = hasHillBaseline;

  let hrW = hasHr ? baseW.hr : 0;
  let paceW = hasPace ? baseW.pace : 0;
  let elevW = hasElev ? baseW.elev : 0;
  const sumW = hrW + paceW + elevW;
  if (sumW > 0) {
    hrW /= sumW;
    paceW /= sumW;
    elevW /= sumW;
  }

  const fmtW = (w: number) => `${Math.round(w * 100)}%`;
  if (hasHr && args.run.averageHrBpm && args.userReferenceMaxHr) {
    const hrPct = (args.run.averageHrBpm / args.userReferenceMaxHr) * 100;
    reasons.push(
      `HR load (weight ${fmtW(hrW)}): ${minutes.toFixed(0)} min at ${hrPct.toFixed(0)}% of reference max ${args.userReferenceMaxHr} bpm.`,
    );
  } else if (hrRaw == null) {
    reasons.push("HR load: unavailable for this run (no avg HR or no reference max).");
  }

  if (hasPace && pace != null && args.baselines.paceP65SecPerMi) {
    reasons.push(
      `Pace stress (weight ${fmtW(paceW)}): ${fmtPace(pace)} vs easy baseline ${fmtPace(args.baselines.paceP65SecPerMi)} → ${(paceStress as number * 100).toFixed(0)}% of cap.`,
    );
  } else {
    reasons.push("Pace stress: no easy-pace baseline yet for this window.");
  }

  if (hasElev && args.baselines.elevP75FtPerMi) {
    reasons.push(
      `Hill load (weight ${fmtW(elevW)}): ${elevFtPerMi.toFixed(0)} ft/mi vs hilliness baseline ${args.baselines.elevP75FtPerMi.toFixed(0)} ft/mi → ${(elevStress as number * 100).toFixed(0)}% of cap.`,
    );
  } else if (elevFtPerMi > 0) {
    reasons.push(
      `Hill load: ${elevFtPerMi.toFixed(0)} ft/mi reported, but no hilliness baseline for this window.`,
    );
  } else {
    reasons.push("Hill load: no elevation reported.");
  }

  const exertion = computeRunExertion({
    run: args.run,
    userReferenceMaxHr: args.userReferenceMaxHr,
    exertionProfile: args.exertionProfile,
    baselines: args.baselines,
  });

  const thresholdsSummary = args.exertionProfile
    ? "Score normalized to recent runs; level chosen by percentile in that window."
    : "No effort percentiles for this window — score is unlabeled.";

  if (exertion.score10 != null && args.exertionProfile) {
    const p = args.exertionProfile;
    let band: string;
    if ((exertion.raw ?? 0) <= p.p50) band = `≤P50 (Moderate)`;
    else if ((exertion.raw ?? 0) <= p.p80) band = `P50–P80 (High)`;
    else if ((exertion.raw ?? 0) <= p.p95) band = `P80–P95 (Very high)`;
    else band = `≥P95 (Max)`;
    reasons.push(
      `Composite raw score lands ${band} of the ${args.exertionProfile ? "window" : "history"}'s exertion distribution → ${exertion.score10.toFixed(1)}/10 (${exertion.level}).`,
    );
  }

  return { exertion, reasons, thresholdsSummary };
}

export type PaceSample = {
  paceSecPerMi: number;
  weight: number;
};

export function robustWeightedMedian(samples: PaceSample[]): number | null {
  const clean = samples
    .filter((s) => Number.isFinite(s.paceSecPerMi) && s.paceSecPerMi > 0 && s.weight > 0)
    .sort((a, b) => a.paceSecPerMi - b.paceSecPerMi);
  if (clean.length < 3) return null;
  const totalW = clean.reduce((a, s) => a + s.weight, 0);
  let acc = 0;
  for (const s of clean) {
    acc += s.weight;
    if (acc >= totalW / 2) return s.paceSecPerMi;
  }
  return clean[clean.length - 1]?.paceSecPerMi ?? null;
}

export function runPaceSample(run: RunForMetrics): PaceSample | null {
  const meters = run.distanceMeters ?? 0;
  const seconds = run.movingTimeSec ?? 0;
  if (!meters || meters <= 0 || !seconds || seconds <= 0) return null;
  const pace = paceSecondsPerMile({ seconds, meters });
  if (!pace) return null;
  // Weight longer runs more (but cap so marathons don’t dominate).
  const miles = meters / 1609.344;
  const weight = clamp(miles, 1, 6);
  return { paceSecPerMi: pace, weight };
}

export type PredictedTimes = {
  /** pace sec/mi */
  easyPace: number | null;
  tempoPace: number | null;
  thresholdPace: number | null;
  racePace: number | null;
};

export function predictPacesFromTaggedRuns(args: {
  taggedRuns: Array<{ tagId: string; run: RunForMetrics }>;
  profile: RunTrainingProfile;
}): PredictedTimes {
  const buckets: Record<string, PaceSample[]> = {
    easy: [],
    tempo: [],
    threshold: [],
    race: [],
  };
  for (const r of args.taggedRuns) {
    const id = r.tagId;
    const s = runPaceSample(r.run);
    if (!s) continue;
    if (id === "easy" || id === "recovery") buckets.easy.push(s);
    else if (id === "tempo") buckets.tempo.push(s);
    else if (id === "threshold" || id === "intervals") buckets.threshold.push(s);
    else if (id === "race") buckets.race.push(s);
  }

  const easyPace = robustWeightedMedian(buckets.easy);
  const tempoPace = robustWeightedMedian(buckets.tempo) ?? (easyPace ? easyPace * 0.92 : null);
  const thresholdPace =
    robustWeightedMedian(buckets.threshold) ?? (tempoPace ? tempoPace * 0.96 : null);
  const racePace = robustWeightedMedian(buckets.race) ?? (thresholdPace ? thresholdPace * 0.97 : null);

  return { easyPace, tempoPace, thresholdPace, racePace };
}

