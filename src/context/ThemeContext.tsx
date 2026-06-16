/**
 * Theme: light / dark / high-contrast, persisted to localStorage and reflected
 * on <html data-theme>. Respects the OS preference on first load.
 */

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

export type ThemeName = "light" | "dark" | "high-contrast";

interface ThemeState {
  theme: ThemeName;
  setTheme: (t: ThemeName) => void;
  cycleTheme: () => void;
}

const ThemeContext = createContext<ThemeState | undefined>(undefined);
const STORAGE_KEY = "swimware.theme";

function initialTheme(): ThemeName {
  const saved = localStorage.getItem(STORAGE_KEY) as ThemeName | null;
  if (saved) return saved;
  const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches;
  return prefersDark ? "dark" : "light";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeName>(initialTheme);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  const order: ThemeName[] = ["light", "dark", "high-contrast"];
  const value: ThemeState = {
    theme,
    setTheme: setThemeState,
    cycleTheme: () => setThemeState((t) => order[(order.indexOf(t) + 1) % order.length]),
  };

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useTheme(): ThemeState {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within <ThemeProvider>");
  return ctx;
}
