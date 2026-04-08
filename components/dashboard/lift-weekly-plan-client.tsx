"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

export function LiftWeeklyPlanClient({
  initialTargets,
}: {
  initialTargets: {
    pushTarget: number;
    pullTarget: number;
    legsTarget: number;
  };
}) {
  const router = useRouter();
  const [tPush, setTPush] = React.useState(String(initialTargets.pushTarget));
  const [tPull, setTPull] = React.useState(String(initialTargets.pullTarget));
  const [tLegs, setTLegs] = React.useState(String(initialTargets.legsTarget));
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    setTPush(String(initialTargets.pushTarget));
    setTPull(String(initialTargets.pullTarget));
    setTLegs(String(initialTargets.legsTarget));
  }, [initialTargets]);

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const parse = (s: string) => {
      const n = Number(s);
      return Number.isFinite(n) && n >= 0 ? Math.min(14, Math.round(n)) : 0;
    };
    try {
      const res = await fetch("/api/lift-split-plan", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          pushTarget: parse(tPush),
          pullTarget: parse(tPull),
          legsTarget: parse(tLegs),
        }),
      });
      const json = (await res.json().catch(() => null)) as
        | { ok?: boolean; error?: string }
        | null;
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error ?? `Failed (${res.status})`);
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save plan");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 px-6 pb-6">
      {error ? (
        <div className="rounded-xl border border-rose-900/15 bg-rose-50/50 px-3 py-2 text-sm text-rose-800">
          {error}
        </div>
      ) : null}
      <p className="text-xs text-stone-500">
        Sessions per week you aim to hit (0 = not tracking). Consistency compares tagged push / pull /
        legs workouts on the calendar to these targets.
      </p>
      <form onSubmit={onSave} className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs text-stone-500">
          <span>Push</span>
          <input
            type="number"
            min={0}
            max={14}
            value={tPush}
            onChange={(e) => setTPush(e.target.value)}
            className="h-9 w-16 rounded-lg border border-amber-950/15 bg-card px-2 text-sm text-stone-900"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-stone-500">
          <span>Pull</span>
          <input
            type="number"
            min={0}
            max={14}
            value={tPull}
            onChange={(e) => setTPull(e.target.value)}
            className="h-9 w-16 rounded-lg border border-amber-950/15 bg-card px-2 text-sm text-stone-900"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-stone-500">
          <span>Legs</span>
          <input
            type="number"
            min={0}
            max={14}
            value={tLegs}
            onChange={(e) => setTLegs(e.target.value)}
            className="h-9 w-16 rounded-lg border border-amber-950/15 bg-card px-2 text-sm text-stone-900"
          />
        </label>
        <button
          type="submit"
          disabled={busy}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-stone-900 px-3 text-xs font-medium text-white hover:bg-stone-800 disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          Save plan
        </button>
      </form>
    </div>
  );
}
