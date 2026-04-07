"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  CalendarDays,
  Dumbbell,
  Gauge,
  HeartPulse,
  LineChart,
  Settings,
  TrendingUp,
} from "lucide-react";

import { cn } from "@/lib/utils";

const navItems = [
  { href: "/overview", label: "Overview", icon: Gauge },
  { href: "/running", label: "Running", icon: Activity },
  { href: "/lifting", label: "Lifting", icon: Dumbbell },
  { href: "/training", label: "Training", icon: CalendarDays },
  { href: "/recovery", label: "Recovery", icon: HeartPulse },
  { href: "/insights", label: "Insights", icon: LineChart },
  { href: "/journey", label: "Journey", icon: TrendingUp },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden md:flex md:w-64 md:flex-col md:bg-transparent">
      <div className="flex h-16 items-center px-6">
        <Link href="/overview" className="text-lg font-semibold tracking-tight text-stone-900">
          Fitness
          <span className="text-stone-500">Dashboard</span>
        </Link>
      </div>
      <nav className="flex flex-1 flex-col gap-1 px-3 pb-4 pt-2">
        {navItems.map((item) => {
          const active =
            pathname === item.href || pathname?.startsWith(`${item.href}/`);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm transition-all",
                active
                  ? "border border-yellow-600/25 bg-yellow-500/10 font-medium text-stone-900 shadow-sm shadow-yellow-950/5"
                  : "border border-transparent text-stone-500 hover:border-yellow-600/15 hover:bg-yellow-950/[0.05] hover:text-stone-700",
              )}
            >
              <Icon className={cn("h-4 w-4", active ? "text-yellow-700" : "")} />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
