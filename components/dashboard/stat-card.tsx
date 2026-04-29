import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function StatCard({
  title,
  value,
  hint,
  trend,
  className,
  fillHeight,
}: {
  title: string;
  value: string;
  hint?: string;
  trend?: { label: string; tone?: "up" | "down" | "neutral" };
  className?: string;
  /** Grow to fill a flex column (e.g. beside a tall calendar). */
  fillHeight?: boolean;
}) {
  const tone =
    trend?.tone === "up"
      ? "text-[color:var(--ui-success)]"
      : trend?.tone === "down"
        ? "text-[color:var(--ui-danger)]"
        : "text-[color:var(--color-text-tertiary)]";

  return (
    <Card
      className={cn(
        "relative overflow-hidden",
        fillHeight ? "flex min-h-0 flex-1 flex-col" : "min-h-[110px]",
        className,
      )}
    >
      <div
        className="absolute left-0 top-0 h-full w-1 bg-[color:var(--ui-accent)]"
        aria-hidden="true"
      />
      <CardHeader className="shrink-0 pb-2 pl-6">
        <CardTitle className="text-xs font-medium tracking-wider text-[color:var(--color-text-tertiary)] uppercase">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent
        className={cn(
          "pl-6",
          fillHeight
            ? "flex flex-1 flex-col justify-center pb-6"
            : "flex items-end justify-between gap-3",
        )}
      >
        <div className="space-y-1">
          <div className="text-2xl font-semibold tracking-tight text-[color:var(--color-text-primary)]">{value}</div>
          {hint ? (
            <div className="text-xs text-[color:var(--color-text-tertiary)]">{hint}</div>
          ) : null}
        </div>
        {trend ? (
          <div className={cn("text-xs font-medium", tone)}>{trend.label}</div>
        ) : null}
      </CardContent>
    </Card>
  );
}
