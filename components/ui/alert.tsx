import * as React from "react";
import { cn } from "@/lib/utils";

function Alert({ className, ...props }: React.ComponentProps<"div">) {
  return <div role="alert" data-slot="alert" className={cn("relative w-full rounded-lg border border-border bg-card p-4 text-sm text-card-foreground", className)} {...props} />;
}
function AlertTitle({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="alert-title" className={cn("mb-1 font-medium leading-none tracking-tight", className)} {...props} />;
}
function AlertDescription({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="alert-description" className={cn("text-sm leading-relaxed text-muted-foreground", className)} {...props} />;
}
export { Alert, AlertTitle, AlertDescription };
