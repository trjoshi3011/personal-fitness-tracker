/**
 * Single, deterministic run classifier.
 *
 * Classification uses only metrics that are stable across the table view
 * (distance, duration, avg/max HR, name hint) so that every surface displays
 * the SAME tag for a given run. Heart-rate intensity is normalized against a
 * per-user reference max HR — if you've ever hit 195 bpm in another run, this
 * run's 162 bpm average will read as tempo (not threshold).
 *
 * If we don't have enough data to classify confidently, we return the
 * "unclassified" tag so the user can see at a glance which runs lack signal.
 */

export type RunTagId =
  | "race"
  | "long"
  | "intervals"
  | "tempo"
  | "threshold"
  | "easy"
  | "recovery"
  | "unclassified";

export type RunTag = {
  id: RunTagId;
  label: string;
  /** Short caption shown in the expanded panel. */
  description: string;
  /** Solid color used for the badge dot, sparkline, and accents. */
  color: string;
};

const TAGS: Record<RunTagId, Omit<RunTag, "id">> = {
  race: {
    label: "Race",
    description: "Race-day or all-out effort (≥92% of max HR).",
    color: "#a855f7",
  },
  long: {
    label: "Long run",
    description: "Long-distance aerobic run (≥10 mi).",
    color: "#3b82f6",
  },
  intervals: {
    label: "Intervals",
    description: "Short, hard workout above threshold (≥88% max HR, <45 min).",
    color: "#f97316",
  },
  threshold: {
    label: "Threshold",
    description: "Sustained effort near lactate threshold (85–88% max HR).",
    color: "#ef4444",
  },
  tempo: {
    label: "Tempo",
    description: "Comfortably hard aerobic effort (78–85% max HR).",
    color: "#f59e0b",
  },
  easy: {
    label: "Easy",
    description: "Conversational aerobic effort (65–78% max HR).",
    color: "#22c55e",
  },
  recovery: {
    label: "Recovery",
    description: "Short, low-HR shakeout (<65% max HR).",
    color: "#06b6d4",
  },
  unclassified: {
    label: "Unclassified",
    description: "Not enough data to classify (missing HR or distance).",
    color: "#94a3b8",
  },
};

function tagOf(id: RunTagId): RunTag {
  return { id, ...TAGS[id] };
}

const NAME_RULES: Array<{ regex: RegExp; tag: RunTagId }> = [
  { regex: /\b(race|championship|relay|grand[\s-]*prix)\b/i, tag: "race" },
  {
    regex: /\b(5\s*k|10\s*k|half\s*marathon|\bhm\b|marathon|10\s*mile|10\s*mi)\b/i,
    tag: "race",
  },
  { regex: /\b(long\s*run|\blr\b)\b/i, tag: "long" },
  {
    regex: /\b(interval|intervals|workout|fartlek|repeats?|track|hill\s*repeats|x\s*\d+)\b/i,
    tag: "intervals",
  },
  { regex: /\b(threshold|\blt\b|\bcv\b|critical\s*velocity)\b/i, tag: "threshold" },
  { regex: /\b(tempo)\b/i, tag: "tempo" },
  {
    regex: /\b(recovery|shake[\s-]?out|cool[\s-]?down|warm[\s-]?up)\b/i,
    tag: "recovery",
  },
  { regex: /\b(easy|chill|jog)\b/i, tag: "easy" },
];

function classifyFromName(name: string | null | undefined): RunTagId | null {
  if (!name) return null;
  for (const r of NAME_RULES) {
    if (r.regex.test(name)) return r.tag;
  }
  return null;
}

export type ClassifyInput = {
  name?: string | null;
  distanceMeters?: number | null;
  movingTimeSec?: number | null;
  averageHrBpm?: number | null;
  maxHrBpm?: number | null;
  /**
   * Reference max HR to normalize this run's intensity against.
   * Typically the per-user observed max across all their runs.
   * If omitted or invalid, we fall back to this run's own maxHrBpm.
   */
  userReferenceMaxHr?: number | null;
};

export function classifyRun(input: ClassifyInput): RunTag {
  const distanceMi =
    input.distanceMeters != null && input.distanceMeters > 0
      ? input.distanceMeters / 1609.344
      : 0;
  const durationMin =
    input.movingTimeSec != null && input.movingTimeSec > 0
      ? input.movingTimeSec / 60
      : 0;

  // 1. Explicit name hint always wins — that's the user's stated intent.
  const fromName = classifyFromName(input.name);
  if (fromName) return tagOf(fromName);

  // 2. Distance-defined long run (>=10 mi). Defined by distance alone so it
  //    works even without HR signal.
  if (distanceMi >= 10) return tagOf("long");

  // 3. We need HR signal to classify intensity. Without it, mark as
  //    unclassified (unless distance was sufficient for the long-run rule).
  const avg = input.averageHrBpm ?? null;
  const ownMax = input.maxHrBpm ?? null;
  const ref =
    typeof input.userReferenceMaxHr === "number" && input.userReferenceMaxHr > 100
      ? input.userReferenceMaxHr
      : ownMax;

  const hrSane = avg != null && avg > 60 && ref != null && ref > 100;
  if (!hrSane || distanceMi <= 0 || durationMin <= 0) {
    return tagOf("unclassified");
  }

  const hrPct = ((avg as number) / (ref as number)) * 100;

  // 4. Intensity buckets. Order matters — race trumps intervals trumps threshold.
  if (hrPct >= 92) return tagOf("race");
  if (hrPct >= 88 && durationMin <= 45) return tagOf("intervals");
  if (hrPct >= 85) return tagOf("threshold");
  if (hrPct >= 78) return tagOf("tempo");
  if (hrPct < 65 && distanceMi < 4 && durationMin <= 35) return tagOf("recovery");
  return tagOf("easy");
}

/** Returns the tag definition by id (useful for static color/label lookups). */
export function getTagDefinition(id: RunTagId): RunTag {
  return tagOf(id);
}
