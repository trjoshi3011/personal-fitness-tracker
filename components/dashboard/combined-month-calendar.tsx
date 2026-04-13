import Link from "next/link";
import { Dumbbell, Footprints } from "lucide-react";

import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatZonedCalendarMonthTitle } from "@/lib/format-zoned";
import { shiftZonedMonth, zonedMonthGridMeta } from "@/lib/zoned-calendar";

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"] as const;

type CombinedMonthCalendarProps = {
  basePath: string;
  year: number;
  month1: number;
  timeZone: string;
  runDays: Set<number>;
  liftDays: Set<number>;
};

export function CombinedMonthCalendar({
  basePath,
  year,
  month1,
  timeZone,
  runDays,
  liftDays,
}: CombinedMonthCalendarProps) {
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

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-4 pb-3">
        <div>
          <CardTitle>{title}</CardTitle>
          <p className="mt-0.5 text-[10px] text-stone-400">Activity calendar · {timeZone}</p>
        </div>
        <div className="flex items-center gap-1.5">
          <Link
            href={`${basePath}${qs(prev.year, prev.month1)}`}
            className="rounded-md border border-amber-900/12 bg-card px-2 py-1 text-xs text-stone-600 transition-colors hover:bg-amber-50/50"
          >
            &lsaquo;
          </Link>
          <Link
            href={`${basePath}${qs(next.year, next.month1)}`}
            className="rounded-md border border-amber-900/12 bg-card px-2 py-1 text-xs text-stone-600 transition-colors hover:bg-amber-50/50"
          >
            &rsaquo;
          </Link>
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        <div className="grid grid-cols-7 text-center text-[9px] font-semibold tracking-widest text-stone-400 uppercase">
          {WEEKDAYS.map((d, i) => (
            <div key={i} className="py-1">
              {d}
            </div>
          ))}
        </div>

        <div className="mt-0.5 grid grid-cols-7 gap-px">
          {cells.map((day, i) => {
            if (day == null) {
              return <div key={`e-${i}`} className="h-7" />;
            }
            const ran = runDays.has(day);
            const lifted = liftDays.has(day);
            const both = ran && lifted;

            let cellBg: string;
            let cellText: string;
            let cellRing: string;
            if (both) {
              cellBg = "bg-gradient-to-br from-amber-500/20 to-rose-400/20";
              cellText = "text-stone-900 font-semibold";
              cellRing = "ring-1 ring-amber-500/30";
            } else if (ran) {
              cellBg = "bg-amber-500/20";
              cellText = "text-amber-800 font-semibold";
              cellRing = "ring-1 ring-amber-500/40";
            } else if (lifted) {
              cellBg = "bg-rose-400/15";
              cellText = "text-rose-800 font-semibold";
              cellRing = "ring-1 ring-rose-400/35";
            } else {
              cellBg = "";
              cellText = "text-stone-500";
              cellRing = "";
            }

            return (
              <div
                key={day}
                className={cn(
                  "relative flex h-7 items-center justify-center rounded-md text-xs tabular-nums transition-colors",
                  cellBg,
                  cellText,
                  cellRing,
                  !ran && !lifted && "hover:bg-stone-100/50",
                )}
              >
                {day}
                {(ran || lifted) && (
                  <span className="absolute bottom-0 left-1/2 flex -translate-x-1/2 gap-px">
                    {ran && <span className="h-[3px] w-[3px] rounded-full bg-amber-500" />}
                    {lifted && <span className="h-[3px] w-[3px] rounded-full bg-rose-400" />}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-stone-400">
          <span className="flex items-center gap-1">
            <Footprints className="h-2.5 w-2.5 text-amber-600" />
            <span className="inline-block h-2 w-2 rounded-sm bg-amber-500/20 ring-1 ring-amber-500/40" />
            {runDays.size} run{runDays.size !== 1 ? "s" : ""}
          </span>
          <span className="flex items-center gap-1">
            <Dumbbell className="h-2.5 w-2.5 text-rose-500" />
            <span className="inline-block h-2 w-2 rounded-sm bg-rose-400/15 ring-1 ring-rose-400/35" />
            {liftDays.size} lift{liftDays.size !== 1 ? "s" : ""}
          </span>
          <span className="ml-auto">{daysInMonth} days</span>
        </div>
      </CardContent>
    </Card>
  );
}
