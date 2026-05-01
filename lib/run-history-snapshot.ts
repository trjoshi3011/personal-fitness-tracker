import type { RunTableRow } from "@/lib/merged-runs";
import { computeRunTrainingProfile, type RunTrainingProfile } from "@/lib/run-tag";
import {
  buildExertionProfile,
  buildPaceElevationBaselines,
  computeCompositeRawExertion,
  type ExertionProfile,
  type PaceElevationBaselines,
} from "@/lib/run-metrics";

/** How many prior runs (including the labeled run) define classification + effort context. */
export const RUN_LABEL_HISTORY_WINDOW = 10;

function sliceWindowEndingAt(
  historyAsc: RunTableRow[],
  endIdxInclusive: number,
): RunTableRow[] {
  const start = Math.max(0, endIdxInclusive + 1 - RUN_LABEL_HISTORY_WINDOW);
  return historyAsc.slice(start, endIdxInclusive + 1);
}

/**
 * Snapshot of the user's training context from a rolling window of recent runs
 * ending at a given activity. Used to "freeze" labels: each run is judged only
 * against the last {@link RUN_LABEL_HISTORY_WINDOW} runs that existed at that
 * time, so older rows do not change when you add new training later.
 */
export type RunHistoricalContext = {
  /** Reference max HR observed up to (and including) the run. */
  userReferenceMaxHr: number | null;
  /** Adaptive distance / duration / HR thresholds at that point in history. */
  trainingProfile: RunTrainingProfile;
  /** Pace + hilliness baselines from runs at that point in history. */
  paceElevationBaselines: PaceElevationBaselines;
  /** Composite exertion percentile profile at that point in history. */
  exertionProfile: ExertionProfile | null;
};

function refMaxHrFromRows(rows: RunTableRow[]): number | null {
  let max = 0;
  for (const r of rows) {
    if (typeof r.maxHrBpm === "number" && r.maxHrBpm > 100 && r.maxHrBpm > max) {
      max = r.maxHrBpm;
    }
  }
  return max > 100 ? max : null;
}

/**
 * Build a historical context from a chronological slice of runs (ascending),
 * typically the last {@link RUN_LABEL_HISTORY_WINDOW} runs ending at the run
 * being labeled.
 */
export function buildHistoricalRunContext(
  rowsAsc: RunTableRow[],
): RunHistoricalContext {
  const userReferenceMaxHr = refMaxHrFromRows(rowsAsc);

  const distancesMi = rowsAsc
    .map((r) => (r.distanceMeters ?? 0) / 1609.344)
    .filter((d) => Number.isFinite(d) && d > 0);
  const durationsMin = rowsAsc
    .map((r) => (r.movingTimeSec ?? 0) / 60)
    .filter((m) => Number.isFinite(m) && m > 0);
  const hrPcts =
    userReferenceMaxHr && userReferenceMaxHr > 100
      ? rowsAsc
          .map((r) =>
            r.averageHrBpm && r.averageHrBpm > 60
              ? (r.averageHrBpm / userReferenceMaxHr) * 100
              : null,
          )
          .filter((p): p is number => typeof p === "number" && Number.isFinite(p))
      : [];

  const trainingProfile = computeRunTrainingProfile({
    distancesMi,
    durationsMin,
    hrPcts,
  });

  const runsForMetrics = rowsAsc.map((r) => ({
    distanceMeters: r.distanceMeters,
    movingTimeSec: r.movingTimeSec,
    averageHrBpm: r.averageHrBpm,
    totalElevationM: r.totalElevationM,
  }));
  const paceElevationBaselines = buildPaceElevationBaselines({
    runs: runsForMetrics,
  });

  const rawExertions = runsForMetrics
    .map((r) =>
      computeCompositeRawExertion({
        run: r,
        userReferenceMaxHr,
        baselines: paceElevationBaselines,
      }),
    )
    .filter((x): x is number => typeof x === "number" && Number.isFinite(x));
  const exertionProfile = buildExertionProfile(rawExertions);

  return {
    userReferenceMaxHr,
    trainingProfile,
    paceElevationBaselines,
    exertionProfile,
  };
}

/**
 * For each run to label, build context from the last {@link RUN_LABEL_HISTORY_WINDOW}
 * runs ending at that run (chronological position in `historyAsc`). `latest`
 * uses the same rule for the most recent activity. Runs not in `historyAsc`
 * fall back to `latest`.
 */
export function buildPerRunHistoricalContexts(args: {
  historyAsc: RunTableRow[];
  rowKeysToLabel: Iterable<string>;
}): {
  byRowKey: Map<string, RunHistoricalContext>;
  latest: RunHistoricalContext;
} {
  const indexByKey = new Map<string, number>();
  args.historyAsc.forEach((r, i) => indexByKey.set(r.rowKey, i));

  const n = args.historyAsc.length;
  const latestSlice =
    n > 0 ? sliceWindowEndingAt(args.historyAsc, n - 1) : [];
  const latest = buildHistoricalRunContext(latestSlice);

  const byRowKey = new Map<string, RunHistoricalContext>();
  for (const key of args.rowKeysToLabel) {
    const idx = indexByKey.get(key);
    if (idx == null) {
      byRowKey.set(key, latest);
      continue;
    }
    const slice = sliceWindowEndingAt(args.historyAsc, idx);
    byRowKey.set(key, buildHistoricalRunContext(slice));
  }
  return { byRowKey, latest };
}
