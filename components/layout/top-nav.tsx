"use client";

import Link from "next/link";
import { Menu, Palette } from "lucide-react";
import * as React from "react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useTheme, type ThemeId } from "@/lib/theme-context";

const navItems = [
  { href: "/overview", label: "Overview" },
  { href: "/running", label: "Running" },
  { href: "/lifting", label: "Lifting" },
  { href: "/training", label: "Training" },
  { href: "/recovery", label: "Recovery" },
  { href: "/insights", label: "Insights" },
  { href: "/journey", label: "Journey" },
  { href: "/settings", label: "Settings" },
] as const;

const themes: { id: ThemeId; label: string; swatch: string }[] = [
  { id: "amber", label: "Amber", swatch: "#d97706" },
  { id: "whoop", label: "WHOOP", swatch: "#22c55e" },
];

const SCROLL_TOP_SHOW_PX = 24;
const SCROLL_DELTA_PX = 6;

export function TopNav() {
  const logoutFormRef = React.useRef<HTMLFormElement | null>(null);
  const lastScrollY = React.useRef(0);
  const { theme, setTheme } = useTheme();
  /** Until true, keep profile visible so SSR + first client paint match (avoids hydration errors). */
  const [scrollReady, setScrollReady] = React.useState(false);
  const [showProfile, setShowProfile] = React.useState(true);

  React.useEffect(() => {
    lastScrollY.current = window.scrollY;
    if (window.scrollY > SCROLL_TOP_SHOW_PX) setShowProfile(false);
    setScrollReady(true);

    const onScroll = () => {
      const y = window.scrollY;
      const prev = lastScrollY.current;
      const delta = y - prev;
      lastScrollY.current = y;

      if (y <= SCROLL_TOP_SHOW_PX) {
        setShowProfile(true);
        return;
      }
      if (delta > SCROLL_DELTA_PX) setShowProfile(false);
      else if (delta < -SCROLL_DELTA_PX) setShowProfile(true);
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const profileVisible = !scrollReady || showProfile;

  return (
    <header className="relative sticky top-0 z-20 flex h-16 items-center bg-transparent px-4 md:px-6">
      <div className="flex items-center gap-2 md:hidden">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Open menu">
              <Menu className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            <DropdownMenuLabel>Navigate</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {navItems.map((item) => (
              <DropdownMenuItem key={item.href} asChild>
                <Link href={item.href}>{item.label}</Link>
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Theme</DropdownMenuLabel>
            {themes.map((t) => (
              <DropdownMenuItem
                key={t.id}
                onSelect={(e) => {
                  e.preventDefault();
                  setTheme(t.id);
                }}
                className="flex items-center gap-2"
              >
                <span
                  className={cn(
                    "h-2 w-2 rounded-full ring-1 ring-black/5",
                    theme === t.id ? "opacity-100" : "opacity-60",
                  )}
                  style={{ backgroundColor: t.swatch }}
                />
                <span className="flex-1">{t.label}</span>
                {theme === t.id ? <span className="text-xs text-stone-400">Selected</span> : null}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="flex-1" />

      <div
        className={cn(
          "absolute top-1/2 right-4 z-20 flex -translate-y-1/2 items-center gap-2 transition-opacity duration-200 ease-out md:right-6",
          profileVisible ? "opacity-100" : "pointer-events-none opacity-0",
        )}
        aria-hidden={!profileVisible}
        suppressHydrationWarning
      >
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              tabIndex={profileVisible ? 0 : -1}
              className="flex items-center gap-2 rounded-xl px-2 py-1.5 outline-none transition-colors hover:bg-yellow-950/5 focus-visible:ring-2 focus-visible:ring-yellow-600/35 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              aria-label="Theme"
            >
              <Palette className="h-4 w-4 text-stone-600" />
              <span
                className="h-2 w-2 rounded-full ring-1 ring-black/5"
                style={{ backgroundColor: themes.find((t) => t.id === theme)?.swatch ?? "#d97706" }}
                aria-hidden
              />
              <span className="hidden text-xs font-medium text-stone-700 md:inline">
                {themes.find((t) => t.id === theme)?.label ?? "Theme"}
              </span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuLabel>Theme</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {themes.map((t) => (
              <DropdownMenuItem
                key={t.id}
                onSelect={(e) => {
                  e.preventDefault();
                  setTheme(t.id);
                }}
                className="flex items-center gap-2"
              >
                <span
                  className="h-2 w-2 rounded-full ring-1 ring-black/5"
                  style={{ backgroundColor: t.swatch }}
                  aria-hidden
                />
                <span className="flex-1">{t.label}</span>
                {theme === t.id ? <span className="text-xs text-stone-400">✓</span> : null}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              tabIndex={profileVisible ? 0 : -1}
              className="flex items-center gap-2.5 rounded-xl px-2 py-1.5 outline-none transition-colors hover:bg-yellow-950/5 focus-visible:ring-2 focus-visible:ring-yellow-600/35 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <Avatar>
                <AvatarFallback>TJ</AvatarFallback>
              </Avatar>
              <div className="hidden text-left text-sm md:block">
                <div className="font-medium leading-none text-stone-900">Tanay</div>
                <div className="mt-1 text-xs text-stone-500">Personal</div>
              </div>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Account</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/settings">Settings</Link>
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={(e) => {
                // Radix dropdown will call preventDefault on certain structures;
                // force a real POST logout submission.
                e.preventDefault();
                logoutFormRef.current?.requestSubmit();
              }}
            >
              Log out
            </DropdownMenuItem>
            <form
              ref={logoutFormRef}
              action="/api/auth/logout"
              method="post"
            />
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
