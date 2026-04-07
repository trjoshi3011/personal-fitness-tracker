"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { readTrainingContextDraft } from "@/components/dashboard/training-context-panel";

export function TrainingGenerateToolbar({
  mondayKey,
  prevKey,
  nextKey,
}: {
  mondayKey: string;
  prevKey: string;
  nextKey: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function onGenerate() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set("weekStart", mondayKey);
      fd.set("userContext", readTrainingContextDraft());
      const res = await fetch("/api/training/generate", {
        method: "POST",
        body: fd,
      });
      const json = (await res.json().catch(() => null)) as
        | { ok?: boolean; weekStart?: string; error?: string }
        | null;
      if (!res.ok || !json?.ok || !json.weekStart) {
        throw new Error(json?.error ?? `Request failed (${res.status})`);
      }
      router.push(`/training?ws=${encodeURIComponent(json.weekStart)}&gen=ok`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not generate plan");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Link
          href={`/training?ws=${prevKey}`}
          className="rounded-md border border-amber-900/12 bg-card px-2 py-1 text-xs text-stone-600 transition-colors hover:bg-amber-50/50"
        >
          Prev 2 weeks
        </Link>
        <Link
          href={`/training?ws=${nextKey}`}
          className="rounded-md border border-amber-900/12 bg-card px-2 py-1 text-xs text-stone-600 transition-colors hover:bg-amber-50/50"
        >
          Next 2 weeks
        </Link>
        <button
          type="button"
          disabled={busy}
          onClick={() => void onGenerate()}
          className="inline-flex items-center gap-1.5 rounded-md border border-amber-900/15 bg-gradient-to-r from-amber-50/80 via-yellow-50/70 to-rose-50/50 px-3 py-1 text-xs font-medium text-stone-800 transition-colors hover:bg-amber-50/70 disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          Generate / refresh plan
        </button>
      </div>
      {error ? (
        <p className="text-xs text-rose-700">{error}</p>
      ) : null}
    </div>
  );
}
