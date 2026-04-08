"use client";

import * as React from "react";

export type ThemeId = "amber" | "whoop";

type ThemeContextValue = {
  theme: ThemeId;
  setTheme: (t: ThemeId) => void;
};

const ThemeContext = React.createContext<ThemeContextValue>({
  theme: "amber",
  setTheme: () => {},
});

export const THEME_STORAGE_KEY = "fitnessDashboardTheme.v1";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeRaw] = React.useState<ThemeId>("amber");

  React.useEffect(() => {
    try {
      const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
      if (saved === "whoop") setThemeRaw("whoop");
    } catch {
      /* ignore */
    }
  }, []);

  const setTheme = React.useCallback((t: ThemeId) => {
    setThemeRaw(t);
    try {
      if (t === "whoop") {
        document.documentElement.setAttribute("data-theme", "whoop");
      } else {
        document.documentElement.removeAttribute("data-theme");
      }
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
