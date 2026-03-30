"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

type ButtonVariant = "default" | "secondary" | "ghost";
type ButtonSize = "default" | "sm" | "icon";

const variantClasses: Record<ButtonVariant, string> = {
  default:
    "bg-stone-900 text-white hover:bg-stone-800",
  secondary:
    "border border-amber-950/15 bg-card text-stone-700 hover:border-yellow-600/35 hover:bg-yellow-50/85 hover:text-yellow-900",
  ghost:
    "text-stone-500 hover:bg-yellow-950/5 hover:text-stone-700",
};

const sizeClasses: Record<ButtonSize, string> = {
  default: "h-9 px-3",
  sm: "h-8 px-2 text-sm",
  icon: "h-9 w-9",
};

function Button({
  className,
  variant = "default",
  size = "default",
  type = "button",
  ...props
}: React.ComponentProps<"button"> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
}) {
  return (
    <button
      type={type}
      data-slot="button"
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-xl text-sm font-medium transition-all outline-none focus-visible:ring-2 focus-visible:ring-yellow-600/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50",
        variantClasses[variant],
        sizeClasses[size],
        className,
      )}
      {...props}
    />
  );
}

export { Button };
