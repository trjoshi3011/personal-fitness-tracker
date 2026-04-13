import type { CSSProperties } from "react";
import Link from "next/link";
import { Dumbbell } from "lucide-react";

import type { LiftSessionTemplate } from "@prisma/client";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatZonedCalendarMonthTitle } from "@/lib/format-zoned";
import { LIFT_TEMPLATE_LABELS } from "@/lib/lift-session-log";
import { shiftZonedMonth, zonedMonthGridMeta } from "@/lib/zoned-calendar";

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"] as const;

export type LiftDayBucket = {
  /** One entry per tagged lift that day (same type can appear twice). */
  templates: LiftSessionTemplate[];
  untaggedLiftCount: number;
};

const TYPE_ORDER: LiftSessionTemplate[] = ["PUSH", "PULL", "LEGS"];

/** Solid highlight classes (single type, no untagged). */
const TYPE_CELL_CLASS: Record<LiftSessionTemplate, string> = {
  PUSH: "bg-rose-400/20 font-medium text-stone-800 ring-1 ring-rose-400/28",
  PULL: "bg-sky-400/20 font-medium text-stone-800 ring-1 ring-sky-400/28",
  LEGS: "bg-amber-400/22 font-medium text-stone-800 ring-1 ring-amber-500/30",
};

const UNTAGGED_ONLY_CLASS =
  "bg-stone-300/22 font-medium text-stone-800 ring-1 ring-stone-400/30";

const TYPE_RGB: Record<LiftSessionTemplate, string> = {
  PUSH: "251 113 133",
  PULL: "56 189 248",
  LEGS: "251 191 36",
};

const LEGEND_SWATCH: Record<LiftSessionTemplate, string> = {
  PUSH: "bg-rose-400/35 ring-1 ring-rose-500/25",
  PULL: "bg-sky-400/35 ring-1 ring-sky-500/25",
  LEGS: "bg-amber-400/40 ring-1 ring-amber-600/25",
};

function multiTypeGradient(types: LiftSessionTemplate[]): string {
  const n = types.length;
  const parts: string[] = [];
  for (let i = 0; i < n; i++) {
    const t = types[i];
    const lo = (i / n) * 100;
    const hi = ((i + 1) / n) * 100;
    parts.push(
      `rgb(${TYPE_RGB[t]} / 0.22) ${lo}%`,
      `rgb(${TYPE_RGB[t]} / 0.22) ${hi}%`,
    );
  }
  return `linear-gradient(90deg, ${parts.join(", ")})`;
}

function liftDayCellLook(bucket: LiftDayBucket | undefined): {
  className: string;
  style?: CSSProperties;
} {
  const empty = "text-stone-500 hover:bg-stone-100/50";
  if (!bucket) return { className: empty };

  const hasTagged = bucket.templates.length > 0;
  const hasUntagged = bucket.untaggedLiftCount > 0;
  if (!hasTagged && !hasUntagged) return { className: empty };

  const uniq = TYPE_ORDER.filter((t) => bucket.templates.includes(t));

  if (!hasTagged && hasUntagged) {
    return { className: UNTAGGED_ONLY_CLASS };
  }

  if (uniq.length === 1 && !hasUntagged) {
    return { className: TYPE_CELL_CLASS[uniq[0]] };
  }

  if (uniq.length === 1 && hasUntagged) {
    const t = uniq[0];
    return {
      className: "font-medium text-stone-800 ring-1 ring-stone-400/28",
      style: {
        background: `linear-gradient(180deg, rgb(${TYPE_RGB[t]} / 0.22) 0%, rgb(${TYPE_RGB[t]} / 0.22) 58%, rgb(214 211 209 / 0.4) 58%, rgb(214 211 209 / 0.4) 100%)`,
      },
    };
  }

  const bg = multiTypeGradient(uniq);
  if (hasUntagged) {
    return {
      className: "font-medium text-stone-800 ring-2 ring-stone-400/35",
      style: {
        backgroundImage: `linear-gradient(180deg, transparent 0%, transparent 62%, rgb(214 211 209 / 0.4) 62%), ${bg}`,
      },
    };
  }

  return {
    className: "font-medium text-stone-800 ring-1 ring-stone-500/15",
    style: { backgroundImage: bg },
  };
}

type LiftingTypeMonthCalendarProps = {
  basePath?: "/lifting";
  year: number;
  month1: number;
  timeZone: string;
  dayMap: Map<number, LiftDayBucket>;
  className?: string;
};

export function LiftingTypeMonthCalendar({
  basePath = "/lifting",
  year,
  month1,
  timeZone,
  dayMap,
  className,
}: LiftingTypeMonthCalendarProps) {
  const { daysInMonth, leadingBlanks } = zonedMonthGridMeta(year, month1, timeZone);
  const prev = shiftZonedMonth(year, month1, -1);
  const next = shiftZonedMonth(year, month1, 1);
  const qs = (y: number, m: number) => `?y=${y}&m=${m}`;
  const title = formatZonedCalendarMonthTitle(year, month1, timeZone);

  const cells: (number | null)[] = [
    ...Array.from({ length: leadingBlanks }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  const tail = (7 - (cells.length % 7)) % 7;
  for (let i = 0; i < tail; i++) cells.push(null);

  let taggedDays = 0;
  let liftDayCount = 0;
  for (const [, b] of dayMap) {
    if (b.templates.length > 0) taggedDays += 1;
    if (b.templates.length > 0 || b.untaggedLiftCount > 0) liftDayCount += 1;
  }

  return (
    <Card className={cn("flex min-h-0 flex-1 flex-col border-0 shadow-none", className)}>
      <CardHeader className="flex shrink-0 flex-row items-center justify-between gap-3 pb-2">
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-rose-400/15">
            <Dumbbell className="h-3 w-3 text-rose-500" />
          </div>
          <div>
            <CardTitle className="text-sm leading-tight">{title}</CardTitle>
            <p className="mt-0.5 text-[9px] text-stone-400">{timeZone}</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Link
            href={`${basePath}${qs(prev.year, prev.month1)}`}
            className="rounded-md border border-amber-900/12 bg-card px-1.5 py-0.5 text-[11px] text-stone-600 transition-colors hover:bg-amber-50/50"
          >
            &lsaquo;
          </Link>
          <Link
            href={`${basePath}${qs(next.year, next.month1)}`}
            className="rounded-md border border-amber-900/12 bg-card px-1.5 py-0.5 text-[11px] text-stone-600 transition-colors hover:bg-amber-50/50"
          >
            &rsaquo;
          </Link>
        </div>
      </CardHeader>

      <CardContent className="flex shrink-0 flex-col pt-0">
        <div className="grid shrink-0 grid-cols-7 text-center text-[8px] font-semibold tracking-widest text-stone-400 uppercase">
          {WEEKDAYS.map((d, i) => (
            <div key={i} className="py-0.5">
              {d}
            </div>
          ))}
        </div>

        <div
          className="mt-px grid grid-cols-7 gap-px"
          style={{ gridAutoRows: "minmax(1.5rem, auto)" }}
        >
          {cells.map((day, i) => {
            if (day == null) {
              return <div key={`e-${i}`} className="min-h-[1.5rem]" />;
            }
            const bucket = dayMap.get(day);
            const { className: cellClass, style } = liftDayCellLook(bucket);
            const titleParts: string[] = [];
            if (bucket) {
              const seen = new Set<string>();
              for (const t of bucket.templates) {
                const lab = LIFT_TEMPLATE_LABELS[t];
                if (!seen.has(lab)) {
                  seen.add(lab);
                  titleParts.push(lab);
                }
              }
              if (bucket.untaggedLiftCount > 0) {
                titleParts.push(
                  `${bucket.untaggedLiftCount} lift${bucket.untaggedLiftCount !== 1 ? "s" : ""} (no type)`,
                );
              }
            }

            return (
              <div
                key={day}
                title={titleParts.length > 0 ? titleParts.join(" · ") : undefined}
                style={style}
                className={cn(
                  "flex min-h-[1.6875rem] items-center justify-center rounded-[0.2rem] px-0.5 text-[11px] tabular-nums transition-colors",
                  cellClass,
                )}
              >
                {day}
              </div>
            );
          })}
        </div>

        <div className="mt-2 shrink-0 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-amber-900/10 pt-2 text-[9px] text-stone-500">
          {TYPE_ORDER.map((t) => (
            <span key={t} className="flex items-center gap-1">
              <span
                className={cn("h-2 w-4 shrink-0 rounded-sm", LEGEND_SWATCH[t])}
                aria-hidden
              />
              {LIFT_TEMPLATE_LABELS[t]}
            </span>
          ))}
          <span className="flex items-center gap-1">
            <span
              className="h-2 w-4 shrink-0 rounded-sm bg-stone-300/50 ring-1 ring-stone-400/35"
              aria-hidden
            />
            No type
          </span>
          <span className="ml-auto text-stone-400">
            {liftDayCount} day{liftDayCount !== 1 ? "s" : ""} with lifts · {taggedDays} with a type
          </span>
        </div>
      </CardContent>
      <div className="min-h-0 flex-1" aria-hidden />
    </Card>
  );
}
