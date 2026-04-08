"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import type { LiftSessionTemplate } from "@prisma/client";
import { cn } from "@/lib/utils";
import { LIFT_TEMPLATE_LABELS } from "@/lib/lift-session-log";

const OPTIONS: LiftSessionTemplate[] = ["PUSH", "PULL", "LEGS"];

export function WhoopLiftTypeSelect({
  workoutId,
  initial,
  className,
}: {
  workoutId: string;
  initial: LiftSessionTemplate | null;
  className?: string;
}) {
  const router = useRouter();
  const [value, setValue] = React.useState<string>(initial ?? "");
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    setValue(initial ?? "");
  }, [initial, workoutId]);

  async function commit(next: string) {
    const prev = value;
    setValue(next);
    setBusy(true);
    try {
      const res = await fetch(`/api/whoop-workouts/${workoutId}/lift-template`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          template: next === "" ? null : next,
        }),
      });
      const json = (await res.json().catch(() => null)) as
        | { ok?: boolean; error?: string }
        | null;
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error ?? `Failed (${res.status})`);
      }
      router.refresh();
    } catch {
      setValue(prev);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={cn("relative inline-flex items-center", className)}>
      <select
        value={value}
        disabled={busy}
        onChange={(e) => void commit(e.target.value)}
        className={cn(
          "max-w-[140px] rounded-lg border border-amber-950/15 bg-card py-1.5 pl-2 pr-7 text-xs text-stone-900",
          busy && "opacity-60",
        )}
        aria-label="Lift session type"
      >
        <option value="">Not set</option>
        {OPTIONS.map((t) => (
          <option key={t} value={t}>
            {LIFT_TEMPLATE_LABELS[t]}
          </option>
        ))}
      </select>
      {busy ? (
        <Loader2 className="pointer-events-none absolute right-2 h-3.5 w-3.5 animate-spin text-stone-400" />
      ) : null}
    </div>
  );
}
