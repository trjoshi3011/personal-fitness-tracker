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

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeRaw] = React.useState<ThemeId>("olive");
  const [mode, setModeRaw] = React.useState<ThemeMode>("light");

  React.useEffect(() => {
    try {
      const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
      if (saved === "olive" || saved === "lavender" || saved === "terracotta") {
        setThemeRaw(saved);
      } else if (saved === "whoop" || saved === "amber") {
        setThemeRaw("olive");
      }
    } catch {
      /* ignore */
    }
    try {
      const savedMode = window.localStorage.getItem(THEME_MODE_STORAGE_KEY);
      if (savedMode === "light" || savedMode === "dark") {
        setModeRaw(savedMode);
      }
    } catch {
      /* ignore */
    }
  }, []);

  // Keep the DOM in sync with provider state so light/dark persists reliably
  // across reloads and matches the user's last selection.
  React.useEffect(() => {
    try {
      document.documentElement.setAttribute("data-theme", theme);
      document.documentElement.setAttribute("data-mode", mode);
      document.documentElement.classList.toggle("dark", mode === "dark");
    } catch {
      /* ignore */
    }
  }, [theme, mode]);

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
      // Toggle the class so any `dark:` utilities also pick it up.
      document.documentElement.classList.toggle("dark", m === "dark");
      window.localStorage.setItem(THEME_MODE_STORAGE_KEY, m);
    } catch {
      /* ignore */
    }
  }, []);

  const toggleMode = React.useCallback(() => {
    setMode(mode === "dark" ? "light" : "dark");
  }, [mode, setMode]);

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
