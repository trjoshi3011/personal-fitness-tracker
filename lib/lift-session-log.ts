import type { LiftSessionTemplate } from "@prisma/client";

import { formatZonedDateShort } from "@/lib/format-zoned";
import {
  localCalendarParts,
  startOfZonedCalendarDay,
  startOfZonedWeekMondayContaining,
  zonedDatePlusDays,
} from "@/lib/zoned-calendar";

/** Stable iteration order for UI and weekly counts (no full-body). */
export const LIFT_TEMPLATE_KEYS = [
  "PUSH",
  "PULL",
  "LEGS",
] as const satisfies readonly LiftSessionTemplate[];

export const LIFT_TEMPLATE_LABELS: Record<LiftSessionTemplate, string> = {
  PUSH: "Push",
  PULL: "Pull",
  LEGS: "Legs",
};

export type LiftExerciseRow = { name: string; reps?: number };

export function parseLiftExercises(raw: unknown): LiftExerciseRow[] {
  if (!Array.isArray(raw)) return [];
  const out: LiftExerciseRow[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const o = row as Record<string, unknown>;
    const name = typeof o.name === "string" ? o.name.trim().slice(0, 120) : "";
    if (!name) continue;
    let reps: number | undefined;
    if (typeof o.reps === "number" && Number.isFinite(o.reps) && o.reps >= 0) {
      reps = Math.min(99_999, Math.round(o.reps));
    }
    out.push(reps != null ? { name, reps } : { name });
    if (out.length >= 50) break;
  }
  return out;
}

export function isLiftSessionTemplate(s: string): s is LiftSessionTemplate {
  return s === "PUSH" || s === "PULL" || s === "LEGS";
}

/** Monday starts, oldest → newest (for charts). */
export function lastNZonedWeekStarts(n: number, ref: Date, tz: string): Date[] {
  const out: Date[] = [];
  let mon = startOfZonedWeekMondayContaining(ref, tz);
  for (let i = 0; i < n; i++) {
    out.unshift(mon);
    const p = localCalendarParts(mon, tz);
    const prev = zonedDatePlusDays(p.y, p.m, p.d, -7, tz);
    mon = startOfZonedCalendarDay(prev.y, prev.m, prev.d, tz);
  }
  return out;
}

export function weekShortLabel(monday: Date, tz: string): string {
  const p = localCalendarParts(monday, tz);
  const d = startOfZonedCalendarDay(p.y, p.m, p.d, tz);
  return formatZonedDateShort(d, tz);
}

export type TemplateCounts = Record<LiftSessionTemplate, number>;

export function emptyTemplateCounts(): TemplateCounts {
  return { PUSH: 0, PULL: 0, LEGS: 0 };
}

export function addToWeekBuckets(
  sessionAt: Date,
  template: LiftSessionTemplate,
  tz: string,
  buckets: Map<number, TemplateCounts>,
) {
  const wk = startOfZonedWeekMondayContaining(sessionAt, tz).getTime();
  const cur = buckets.get(wk) ?? emptyTemplateCounts();
  cur[template] += 1;
  buckets.set(wk, cur);
}

export type WeeklyTargets = {
  pushTarget: number;
  pullTarget: number;
  legsTarget: number;
};

export function targetsToRecord(t: WeeklyTargets): TemplateCounts {
  return {
    PUSH: t.pushTarget,
    PULL: t.pullTarget,
    LEGS: t.legsTarget,
  };
}

/**
 * Consistency for the week: average of min(1, actual/target) over templates with target > 0.
 * Returns null if no targets set.
 */
export function weekConsistencyScore(
  actual: TemplateCounts,
  targets: TemplateCounts,
): number | null {
  const parts: number[] = [];
  (Object.keys(targets) as LiftSessionTemplate[]).forEach((k) => {
    const tgt = targets[k];
    if (tgt <= 0) return;
    parts.push(Math.min(1, actual[k] / tgt));
  });
  if (parts.length === 0) return null;
  return parts.reduce((a, b) => a + b, 0) / parts.length;
}
