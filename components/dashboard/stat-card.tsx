import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function StatCard({
  title,
  value,
  hint,
  trend,
  className,
}: {
  title: string;
  value: string;
  hint?: string;
  trend?: { label: string; tone?: "up" | "down" | "neutral" };
  className?: string;
}) {
  const tone =
    trend?.tone === "up"
      ? "text-yellow-700"
      : trend?.tone === "down"
        ? "text-rose-600"
        : "text-stone-500";

  return (
    <Card className={cn("relative min-h-[110px] overflow-hidden", className)}>
      <div
        className="absolute left-0 top-0 h-full w-1 bg-gradient-to-b from-yellow-500 via-amber-500 to-yellow-800"
        aria-hidden="true"
      />
      <CardHeader className="pb-2 pl-6">
        <CardTitle className="text-xs font-medium tracking-wider text-stone-500 uppercase">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex items-end justify-between gap-3 pl-6">
        <div className="space-y-1">
          <div className="text-2xl font-semibold tracking-tight text-stone-900">{value}</div>
          {hint ? (
            <div className="text-xs text-stone-500">{hint}</div>
          ) : null}
        </div>
        {trend ? (
          <div className={cn("text-xs font-medium", tone)}>{trend.label}</div>
        ) : null}
      </CardContent>
    </Card>
  );
}
