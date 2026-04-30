"use client";

import * as React from "react";

export type ThemeId = "olive" | "lavender" | "terracotta";
export type ThemeMode = "light" | "dark";

type ThemeContextValue = {
  theme: ThemeId;
  setTheme: (t: ThemeId) => void;
  mode: ThemeMode;
  setMode: (m: ThemeMode) => void;
  toggleMode: () => void;
};

const ThemeContext = React.createContext<ThemeContextValue>({
  theme: "olive",
  setTheme: () => {},
  mode: "light",
  setMode: () => {},
  toggleMode: () => {},
});

export const THEME_STORAGE_KEY = "fitnessDashboardTheme.v1";
export const THEME_MODE_STORAGE_KEY = "fitnessDashboardThemeMode.v1";

/**
 * Use layoutEffect on the client so we can sync React state with the
 * DOM attributes (set by the inline pre-hydration script) BEFORE the
 * first paint. This avoids a brief window where the toggle button
 * displays the wrong mode and the user could click it in the wrong
 * direction.
 */
const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? React.useLayoutEffect : React.useEffect;

function readDomTheme(): ThemeId {
  if (typeof document === "undefined") return "olive";
  const v = document.documentElement.getAttribute("data-theme");
  return v === "olive" || v === "lavender" || v === "terracotta" ? v : "olive";
}

function readDomMode(): ThemeMode {
  if (typeof document === "undefined") return "light";
  return document.documentElement.getAttribute("data-mode") === "dark"
    ? "dark"
    : "light";
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // SSR initial value — gets corrected synchronously after hydration via
  // the layout effect below, before paint.
  const [theme, setThemeRaw] = React.useState<ThemeId>("olive");
  const [mode, setModeRaw] = React.useState<ThemeMode>("light");

  // Sync React state with the DOM attributes that the inline pre-hydration
  // script has already set from localStorage. Reading the DOM (instead of
  // localStorage directly) guarantees state matches whatever is currently
  // rendered, eliminating the toggle-direction bug.
  useIsomorphicLayoutEffect(() => {
    const domTheme = readDomTheme();
    const domMode = readDomMode();
    setThemeRaw(domTheme);
    setModeRaw(domMode);
    // Belt-and-suspenders: ensure localStorage has the active values too,
    // in case this is a fresh visitor where the inline script defaulted.
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, domTheme);
      window.localStorage.setItem(THEME_MODE_STORAGE_KEY, domMode);
    } catch {
      /* ignore */
    }
  }, []);

  const setTheme = React.useCallback((t: ThemeId) => {
    setThemeRaw(t);
    try {
      document.documentElement.setAttribute("data-theme", t);
      window.localStorage.setItem(THEME_STORAGE_KEY, t);
    } catch {
      /* ignore */
    }
  }, []);

  const setMode = React.useCallback((m: ThemeMode) => {
    setModeRaw(m);
    try {
      document.documentElement.setAttribute("data-mode", m);
      // Tailwind v4 dark variant uses .dark on the html/body when configured.
      document.documentElement.classList.toggle("dark", m === "dark");
      window.localStorage.setItem(THEME_MODE_STORAGE_KEY, m);
    } catch {
      /* ignore */
    }
  }, []);

  // Read mode from DOM at click-time so the toggle direction is always
  // correct, even if React state hasn't caught up yet (e.g., very first
  // render after hydration).
  const toggleMode = React.useCallback(() => {
    const current = readDomMode();
    setMode(current === "dark" ? "light" : "dark");
  }, [setMode]);

  return (
    <ThemeContext.Provider
      value={{ theme, setTheme, mode, setMode, toggleMode }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return React.useContext(ThemeContext);
}
