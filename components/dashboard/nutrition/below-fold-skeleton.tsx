import { Skeleton } from "@/components/ui/skeleton";

/** Pulse placeholder for the streamed `<NutritionBelowFold />`. */
export function NutritionBelowFoldSkeleton() {
  return (
    <div className="space-y-8" aria-busy aria-live="polite">
      <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton
            key={i}
            className="h-24 rounded-xl border border-[color:var(--color-border-subtle)] bg-[color:var(--color-bg-elevated)]/60"
          />
        ))}
      </section>

      <section>
        <Skeleton className="h-72 rounded-xl border border-[color:var(--color-border-subtle)] bg-[color:var(--color-bg-elevated)]/60" />
      </section>

      <section>
        <Skeleton className="h-72 rounded-xl border border-[color:var(--color-border-subtle)] bg-[color:var(--color-bg-elevated)]/60" />
      </section>

      <section className="grid gap-4 lg:grid-cols-5">
        <Skeleton className="h-96 rounded-xl border border-[color:var(--color-border-subtle)] bg-[color:var(--color-bg-elevated)]/60 lg:col-span-3" />
        <Skeleton className="h-96 rounded-xl border border-[color:var(--color-border-subtle)] bg-[color:var(--color-bg-elevated)]/60 lg:col-span-2" />
      </section>
    </div>
  );
}
