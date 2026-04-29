import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function ChartCard({
  title,
  description,
  actions,
  children,
  className,
  contentClassName,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
  contentClassName?: string;
}) {
  return (
    <Card className={cn("overflow-hidden", className)}>
      <CardHeader className="flex-row items-start justify-between gap-4">
        <div className="space-y-1">
          <CardTitle>{title}</CardTitle>
          {description ? (
            <div className="text-sm text-stone-500">{description}</div>
          ) : null}
        </div>
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </CardHeader>
      <CardContent className={cn("pt-0", contentClassName)}>
        {children ?? (
          <div className="grid place-items-center rounded-xl border border-dashed border-[color:var(--color-border-subtle)] bg-[color:var(--ui-accent-soft)] p-8 text-sm text-[color:var(--color-text-tertiary)]">
            Chart placeholder
          </div>
        )}
      </CardContent>
    </Card>
  );
}
