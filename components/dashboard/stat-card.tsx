import { Badge } from "@/components/ui/badge";
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
          <div className="text-3xl font-semibold tabular-nums tracking-tight text-[color:var(--color-text-primary)]">{value}</div>
          {hint ? (
            <div className="text-xs text-[color:var(--color-text-tertiary)]">{hint}</div>
          ) : null}
        </div>
        {trend ? (
          <Badge className={cn("bg-muted font-medium", tone)}>{trend.label}</Badge>
        ) : null}
      </CardContent>
    </Card>
  );
}
