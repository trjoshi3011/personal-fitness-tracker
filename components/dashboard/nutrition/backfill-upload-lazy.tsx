"use client";

import dynamic from "next/dynamic";

/**
 * Client-only mount avoids SSR hydration mismatches when Turbopack serves a
 * stale server chunk for `BackfillUpload` while the browser loads fresher JS
 * after copy edits during dev.
 */
export const BackfillUploadLazy = dynamic(
  () => import("./backfill-upload"),
  {
    ssr: false,
    loading: () => (
      <div
        className="rounded-2xl border border-[color:var(--color-border-subtle)] bg-card/80 p-5 shadow-sm"
        aria-hidden
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1 space-y-2">
            <div className="h-4 w-40 animate-pulse rounded-md bg-[color:var(--color-bg-elevated)]" />
            <div className="h-12 max-w-prose animate-pulse rounded-md bg-[color:var(--ui-accent-soft)]/40" />
          </div>
          <div className="h-10 w-36 animate-pulse rounded-xl bg-[color:var(--color-bg-elevated)]" />
        </div>
      </div>
    ),
  },
);
