import { Skeleton } from "@/components/ui/skeleton";

/**
 * Lightweight skeleton shown while `<InsightsBelowFold />` streams in.
 * Mirrors the rough shape (8 stat cards + chart blocks + form pair) so the
 * page doesn't reflow much when content arrives.
 */
export function InsightsBelowFoldSkeleton() {
  return (
    <div className="space-y-8" aria-busy aria-live="polite">
      <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton
            key={i}
            className="h-24 rounded-xl border border-[color:var(--color-border-subtle)] bg-[color:var(--color-bg-elevated)]/60"
          />
        ))}
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-72 rounded-xl border border-[color:var(--color-border-subtle)] bg-[color:var(--color-bg-elevated)]/60" />
        <Skeleton className="h-72 rounded-xl border border-[color:var(--color-border-subtle)] bg-[color:var(--color-bg-elevated)]/60" />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-72 rounded-xl border border-[color:var(--color-border-subtle)] bg-[color:var(--color-bg-elevated)]/60" />
        <Skeleton className="h-72 rounded-xl border border-[color:var(--color-border-subtle)] bg-[color:var(--color-bg-elevated)]/60" />
      </section>

      <section>
        <Skeleton className="h-80 rounded-xl border border-[color:var(--color-border-subtle)] bg-[color:var(--color-bg-elevated)]/60" />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-80 rounded-xl border border-[color:var(--color-border-subtle)] bg-[color:var(--color-bg-elevated)]/60" />
        <Skeleton className="h-80 rounded-xl border border-[color:var(--color-border-subtle)] bg-[color:var(--color-bg-elevated)]/60" />
      </section>
    </div>
  );
}
