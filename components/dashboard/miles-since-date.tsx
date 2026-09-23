"use client";

import { useMemo, useState } from "react";

type ApiOk = { ok: true; miles: number; date: string };
type ApiErr = { ok: false; error: string };

export function MilesSinceDate() {
  const [date, setDate] = useState("");
  const [loading, setLoading] = useState(false);
  const [miles, setMiles] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = useMemo(() => /^\d{4}-\d{2}-\d{2}$/.test(date), [date]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || loading) return;

    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/running/miles-since?${new URLSearchParams({ date })}`, {
        method: "GET",
        headers: { accept: "application/json" },
      });
      const json = (await res.json()) as ApiOk | ApiErr;
      if (!res.ok || !json.ok) {
        setMiles(null);
        setError("Could not compute miles for that date.");
        return;
      }
      setMiles(json.miles);
    } catch {
      setMiles(null);
      setError("Could not compute miles for that date.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <form onSubmit={onSubmit} className="space-y-2">
        <div className="text-[10px] font-medium tracking-wider text-stone-500 uppercase">
          Start date
        </div>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="h-10 w-full rounded-xl border border-[color:var(--color-border-default)] bg-card px-3 text-sm text-[color:var(--color-text-primary)] outline-none focus:border-[color:color-mix(in_srgb,var(--ui-accent)_45%,transparent)] focus:ring-2 focus:ring-[color:var(--ring)]"
        />
        <button
          type="submit"
          disabled={!canSubmit || loading}
          className="h-10 w-full rounded-xl border border-[color:var(--color-border-default)] bg-card/70 px-3 text-sm font-medium text-[color:var(--color-text-primary)] transition-colors hover:border-[color:color-mix(in_srgb,var(--ui-accent)_45%,transparent)] hover:bg-[color:var(--ui-accent-soft)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? "Calculating…" : "Calculate"}
        </button>
      </form>

      <div className="rounded-xl border border-[color:var(--color-border-subtle)] bg-card/60 p-3">
        <div className="text-[10px] font-medium tracking-wider text-stone-500 uppercase">
          Miles since date
        </div>
        <div className="mt-1 text-2xl font-semibold tracking-tight text-stone-900">
          {miles != null ? miles.toFixed(2) : "—"}
        </div>
        {error ? <div className="mt-2 text-xs text-rose-700">{error}</div> : null}
        <div className="mt-2 text-[10px] text-stone-400">Includes Strava runs + Fitbit activity logs.</div>
      </div>
    </div>
  );
}

