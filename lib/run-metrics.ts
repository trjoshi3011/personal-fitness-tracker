import { paceSecondsPerMile } from "@/lib/units";
import type { RunTrainingProfile } from "@/lib/run-tag";

export type RunForMetrics = {
  distanceMeters: number | null;
  movingTimeSec: number | null;
  averageHrBpm: number | null;
};

export type EffortLevel = "Low" | "Moderate" | "High" | "Very high" | "Max" | "Unclassified";

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
 * TRIMP-like exertion estimate using only duration + HR intensity.
 * We normalize intensity against the user's reference max HR.
 *
 * raw ≈ minutes * exp(k * intensity) (k tuned to spread typical runs)
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

export type ExertionProfile = {
  p50: number;
  p80: number;
  p95: number;
};

export function buildExertionProfile(raws: number[]): ExertionProfile | null {
  const clean = raws.filter((x) => Number.isFinite(x) && x > 0);
  if (clean.length < 8) return null;
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
}): RunExertion {
  const raw = computeRawExertion({
    distanceMeters: args.run.distanceMeters,
    movingTimeSec: args.run.movingTimeSec,
    averageHrBpm: args.run.averageHrBpm,
    userReferenceMaxHr: args.userReferenceMaxHr,
  });
  if (!raw || !args.exertionProfile) {
    return { score10: null, level: "Unclassified", raw: raw ?? null };
  }
  const score10 = normalizeExertion(raw, args.exertionProfile);
  return { score10, level: exertionLevel(raw, args.exertionProfile), raw };
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

