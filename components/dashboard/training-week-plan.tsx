import { Footprints, Moon } from "lucide-react";

import { cn } from "@/lib/utils";
import type { PlannedSession, TrainingPlanPayload } from "@/lib/gemini-training-plan";

const RUN = "bg-amber-500/15 text-amber-900 ring-amber-500/30";
const REST = "bg-stone-100/70 text-stone-600 ring-stone-300/40";

function SessionIcon({ type }: { type: PlannedSession["type"] }) {
  if (type === "run") return <Footprints className="h-3.5 w-3.5 shrink-0 text-amber-600" />;
  return <Moon className="h-3.5 w-3.5 shrink-0 text-stone-500" />;
}

function sessionTone(type: PlannedSession["type"]) {
  if (type === "run") return RUN;
  return REST;
}

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

function sessionsForDate(plan: TrainingPlanPayload | null, dateKey: string) {
  if (!plan) return null;
  const d = plan.days.find((x) => x.date === dateKey);
  return d?.sessions ?? null;
}

function WeekRow({
  weekLabel,
  offset,
  weekDateKeys,
  plan,
}: {
  weekLabel: string;
  offset: 0 | 7;
  weekDateKeys: string[];
  plan: TrainingPlanPayload | null;
}) {
  return (
    <div className="space-y-2">
      <div className="text-[11px] font-semibold tracking-wide text-stone-500 uppercase">
        {weekLabel}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-7">
        {DAY_LABELS.map((label, i) => {
          const idx = offset + i;
          const dateKey = weekDateKeys[idx] ?? "";
          const dom = dateKey.length >= 10 ? dateKey.slice(8, 10) : "—";
          const sessions = sessionsForDate(plan, dateKey);

          return (
            <div
              key={`${weekLabel}-${label}-${dateKey}`}
              className="flex min-h-[180px] flex-col rounded-xl border border-amber-900/10 bg-card/55 p-3 shadow-sm shadow-yellow-950/[0.04]"
            >
              <div className="border-b border-amber-900/10 pb-2">
                <div className="text-[10px] font-semibold tracking-wider text-stone-400 uppercase">
                  {label}
                </div>
                <div className="text-xs text-stone-500">{dateKey}</div>
                <div className="text-sm font-semibold text-stone-900">{dom}</div>
              </div>
              <div className="mt-2 flex flex-1 flex-col gap-2">
                {!sessions || sessions.length === 0 ? (
                  <p className="text-xs leading-relaxed text-stone-500">
                    {plan ? "No sessions for this day." : "Generate a plan to see workouts."}
                  </p>
                ) : (
                  sessions.map((s, j) => (
                    <div
                      key={j}
                      className={cn(
                        "rounded-lg border px-2.5 py-2 text-xs ring-1",
                        sessionTone(s.type),
                      )}
                    >
                      <div className="flex items-start gap-2">
                        <SessionIcon type={s.type} />
                        <div className="min-w-0 flex-1">
                          <div className="font-semibold leading-snug text-stone-900">{s.title}</div>
                          {s.details ? (
                            <p className="mt-1 leading-relaxed text-stone-600">{s.details}</p>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Expects 14 date keys: Monday week 1 … Sunday week 2. */
export function TrainingWeekPlanGrid({
  weekDateKeys,
  plan,
}: {
  weekDateKeys: string[];
  plan: TrainingPlanPayload | null;
}) {
  return (
    <div className="space-y-8">
      <WeekRow weekLabel="Week 1" offset={0} weekDateKeys={weekDateKeys} plan={plan} />
      <WeekRow weekLabel="Week 2" offset={7} weekDateKeys={weekDateKeys} plan={plan} />
    </div>
  );
}
