"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { usePathname } from "next/navigation";
import {
  Activity,
  Apple,
  CalendarDays,
  Dumbbell,
  Gauge,
  HeartPulse,
  LineChart,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  TrendingUp,
} from "lucide-react";

import styles from "@/components/layout/sidebar.module.css";
import { Button } from "@/components/ui/button";

import { cn } from "@/lib/utils";

export const navItems = [
  { href: "/overview", label: "Overview", icon: Gauge },
  { href: "/running", label: "Running", icon: Activity },
  { href: "/lifting", label: "Lifting", icon: Dumbbell },
  { href: "/training", label: "Training", icon: CalendarDays },
  { href: "/recovery", label: "Recovery", icon: HeartPulse },
  { href: "/nutrition", label: "Nutrition", icon: Apple },
  { href: "/insights", label: "Insights", icon: LineChart },
  { href: "/journey", label: "Journey", icon: TrendingUp },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;

export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const open = !collapsed || hovered || focused;

  return (
    <aside
      data-collapsed={collapsed}
      data-open={open}
      aria-label="Sidebar"
      className={cn(styles.sidebar, "sticky top-0 z-30 hidden h-dvh shrink-0 md:block")}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          setCollapsed(true);
          setHovered(false);
          setFocused(false);
          toggleRef.current?.focus();
        }
      }}
    >
      <div
        id="desktop-sidebar-content"
        className={styles.panel}
        aria-hidden={!open}
        inert={!open}
        onFocusCapture={() => setFocused(true)}
        onBlurCapture={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false);
        }}
      >
      <div className="flex h-16 shrink-0 items-center px-6 pr-14">
        <Link href="/overview" className="text-xl font-semibold tracking-tight text-foreground">
          LockIn<span className="text-stone-500">.</span>
        </Link>
      </div>
      <div className="px-6 pb-3 pt-5 text-[11px] font-medium uppercase tracking-widest text-muted-foreground">Workspace</div>
      <nav aria-label="Main navigation" className="flex flex-1 flex-col gap-1 px-3 pb-4 pt-2">
        {navItems.map((item) => {
          const active =
            pathname === item.href || pathname?.startsWith(`${item.href}/`);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-2.5 rounded-md px-3 py-2.5 text-sm transition-all",
                active
                  ? "border border-[color:color-mix(in_srgb,var(--ui-accent)_32%,transparent)] bg-[color:var(--ui-accent-soft)] font-medium text-[color:var(--color-text-primary)] shadow-sm shadow-black/[0.04]"
                  : "border-0 text-[color:var(--color-text-tertiary)] hover:bg-[color:var(--ui-accent-soft)] hover:text-[color:var(--color-text-secondary)]",
              )}
            >
              <Icon
                className={cn(
                  "h-4 w-4",
                  active ? "text-[color:var(--ui-accent)]" : "",
                )}
              />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="m-4 rounded-lg border border-border bg-muted/40 p-3">
        <p className="text-xs font-medium text-foreground">A little better, every day.</p>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Your training, recovery, and progress in one place.</p>
      </div>
      </div>
      <Button
        ref={toggleRef}
        variant="ghost"
        size="icon"
        className={styles.toggle}
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        aria-expanded={open}
        aria-controls="desktop-sidebar-content"
        onClick={() => {
          setCollapsed(!collapsed);
          setHovered(false);
          setFocused(false);
        }}
      >
        {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
      </Button>
    </aside>
  );
}
