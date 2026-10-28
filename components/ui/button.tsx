"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

type ButtonVariant = "default" | "secondary" | "ghost" | "outline" | "destructive" | "link";
type ButtonSize = "default" | "sm" | "icon" | "lg";

const variantClasses: Record<ButtonVariant, string> = {
  default:
    "bg-[color:var(--ui-accent)] text-[color:var(--color-text-inverse)] hover:bg-[color:color-mix(in_srgb,var(--ui-accent)_88%,#000)]",
  secondary:
    "border border-[color:var(--color-border-default)] bg-card text-[color:var(--color-text-secondary)] hover:border-[color:color-mix(in_srgb,var(--ui-accent)_32%,transparent)] hover:bg-[color:var(--ui-accent-soft)] hover:text-[color:var(--color-text-primary)]",
  outline: "border border-input bg-background text-foreground shadow-xs hover:bg-muted",
  destructive: "bg-destructive text-white hover:bg-destructive/90",
  link: "text-primary underline-offset-4 hover:underline",
  ghost:
    "text-[color:var(--color-text-tertiary)] hover:bg-[color:var(--ui-accent-soft)] hover:text-[color:var(--color-text-primary)]",
};

const sizeClasses: Record<ButtonSize, string> = {
  default: "h-9 px-3",
  sm: "h-8 px-2 text-sm",
  icon: "size-9",
  lg: "h-10 px-6",
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
        "inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50",
        variantClasses[variant],
        sizeClasses[size],
        className,
      )}
      {...props}
    />
  );
}

export { Button };
