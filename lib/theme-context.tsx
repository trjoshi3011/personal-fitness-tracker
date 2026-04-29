"use client";

import * as React from "react";

export type ThemeId = "olive" | "lavender" | "terracotta";

type ThemeContextValue = {
  theme: ThemeId;
  setTheme: (t: ThemeId) => void;
};

const ThemeContext = React.createContext<ThemeContextValue>({
  theme: "olive",
  setTheme: () => {},
});

export const THEME_STORAGE_KEY = "fitnessDashboardTheme.v1";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeRaw] = React.useState<ThemeId>("olive");

  React.useEffect(() => {
    try {
      const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
      if (saved === "olive" || saved === "lavender" || saved === "terracotta") {
        setThemeRaw(saved);
      } else if (saved === "whoop" || saved === "amber") {
        // Back-compat: map previous themes into the new trio.
        setThemeRaw("olive");
      }
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

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return React.useContext(ThemeContext);
}
