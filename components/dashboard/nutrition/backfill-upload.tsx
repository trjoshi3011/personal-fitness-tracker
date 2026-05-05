"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Upload, CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";

type Status =
  | { kind: "idle" }
  | { kind: "uploading"; fileName: string; sizeMb: number }
  | {
      kind: "done";
      daysImported: number;
      rangeStart: string | null;
      rangeEnd: string | null;
    }
  | { kind: "error"; message: string };

const ACCEPT_ATTR = "application/xml,text/xml,.xml";

export function BackfillUpload() {
  const router = useRouter();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [status, setStatus] = React.useState<Status>({ kind: "idle" });

  const onPick = () => inputRef.current?.click();

  const onChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // reset so re-uploading the same file fires onChange
    if (!file) return;

    if (file.name.toLowerCase().endsWith(".zip")) {
      setStatus({
        kind: "error",
        message:
          "Please unzip Apple Health's export and upload export.xml directly (not the .zip).",
      });
      return;
    }

    setStatus({
      kind: "uploading",
      fileName: file.name,
      sizeMb: file.size / 1_000_000,
    });

    const fd = new FormData();
    fd.append("file", file);

    try {
      const res = await fetch("/api/nutrition/upload", {
        method: "POST",
        body: fd,
      });
      const json = (await res.json()) as
        | {
            ok: true;
            daysImported: number;
            rangeStart: string | null;
            rangeEnd: string | null;
          }
        | { ok: false; error: string };
      if (!res.ok || !("ok" in json) || json.ok !== true) {
        const msg =
          "error" in json
            ? json.error
            : `Upload failed (${res.status})`;
        setStatus({ kind: "error", message: msg });
        return;
      }
      setStatus({
        kind: "done",
        daysImported: json.daysImported,
        rangeStart: json.rangeStart,
        rangeEnd: json.rangeEnd,
      });
      router.refresh();
    } catch (err) {
      setStatus({
        kind: "error",
        message: err instanceof Error ? err.message : "Upload failed",
      });
    }
  };

  return (
    <div className="rounded-2xl border border-[color:var(--color-border-subtle)] bg-card/80 p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold text-[color:var(--color-text-primary)]">
            Apple Health backfill
          </h2>
          <p className="mt-1 max-w-prose text-xs leading-relaxed text-[color:var(--color-text-tertiary)]">
            Upload <code className="rounded bg-stone-100 px-1 py-0.5 font-mono">export.xml</code>{" "}
            from your Apple Health zip. Dietary records (calories + macros)
            are summed by day and saved as a backfill source. If you also log a
            manual total for that day, your manual entry is shown on charts and
            the backfill row is kept as backup data only.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT_ATTR}
            className="hidden"
            onChange={onChange}
            disabled={status.kind === "uploading"}
          />
          <button
            type="button"
            onClick={onPick}
            disabled={status.kind === "uploading"}
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-[color:var(--color-border-default)] bg-[color:color-mix(in_srgb,var(--background)_60%,transparent)] px-4 text-sm font-medium text-[color:var(--color-text-secondary)] transition-all hover:bg-[color:var(--ui-accent-soft)] hover:text-[color:var(--color-text-primary)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {status.kind === "uploading" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Upload className="h-4 w-4" />
            )}
            {status.kind === "uploading" ? "Importing…" : "Upload export.xml"}
          </button>
        </div>
      </div>

      {status.kind === "uploading" ? (
        <div className="mt-4 rounded-xl border border-[color:var(--color-border-subtle)] bg-[color:var(--ui-accent-soft)]/40 p-3 text-xs text-[color:var(--color-text-secondary)]">
          <div className="flex items-center gap-2">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Parsing <span className="font-medium">{status.fileName}</span> ·
            {" "}
            {status.sizeMb.toFixed(1)} MB
          </div>
          <p className="mt-1 text-[color:var(--color-text-tertiary)]">
            Large exports can take 30–60 seconds. Don’t close this tab.
          </p>
        </div>
      ) : null}

      {status.kind === "done" ? (
        <div className="mt-4 flex items-start gap-2 rounded-xl border border-emerald-300/40 bg-emerald-50 p-3 text-xs text-emerald-900">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
          <div>
            Imported <span className="font-semibold">{status.daysImported}</span>{" "}
            days of dietary records
            {status.rangeStart && status.rangeEnd
              ? ` (${status.rangeStart} → ${status.rangeEnd})`
              : null}
            . Days where you already logged manually stay driven by your manual
            totals.
          </div>
        </div>
      ) : null}

      {status.kind === "error" ? (
        <div className="mt-4 flex items-start gap-2 rounded-xl border border-[color:color-mix(in_srgb,var(--ui-danger)_35%,transparent)] bg-[color:var(--ui-danger-soft)] p-3 text-xs text-[color:color-mix(in_srgb,var(--ui-danger)_72%,var(--color-text-primary))]">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>{status.message}</div>
        </div>
      ) : null}
    </div>
  );
}

export default BackfillUpload;
