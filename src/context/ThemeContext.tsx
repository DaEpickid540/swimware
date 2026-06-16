/**
 * Per-user appearance: color theme (light / dark / high-contrast), a custom
 * ACCENT color, and layout density. All preferences are personal and stored in
 * localStorage (free, no Firestore writes) and applied to <html> so each user
 * styles their own interface independently. Respects OS dark-mode on first load.
 */

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

export type ThemeName = "light" | "dark" | "high-contrast";
export type Density = "comfortable" | "compact";

interface ThemeState {
  theme: ThemeName;
  accent: string | null; // hex override for --color-primary, or null = brand
  density: Density;
  setTheme: (t: ThemeName) => void;
  setAccent: (hex: string | null) => void;
  setDensity: (d: Density) => void;
  cycleTheme: () => void;
}

const ThemeContext = createContext<ThemeState | undefined>(undefined);

const K_THEME = "swimware.theme";
const K_ACCENT = "swimware.accent";
const K_DENSITY = "swimware.density";

/** A few friendly accent presets users can pick from (plus a custom picker). */
export const ACCENT_PRESETS: { label: string; value: string | null }[] = [
  { label: "Rays (default)", value: null },
  { label: "Ocean blue", value: "#0b6bcb" },
  { label: "Lane green", value: "#16a34a" },
  { label: "Teal", value: "#0d9488" },
  { label: "Violet", value: "#7c3aed" },
  { label: "Sunset", value: "#ea580c" },
  { label: "Magenta", value: "#db2777" },
];

function initialTheme(): ThemeName {
  const saved = localStorage.getItem(K_THEME) as ThemeName | null;
  if (saved) return saved;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/** Slightly darken a hex color for the primary-700 (hover) shade. */
function darken(hex: string, amount = 0.18): string {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return hex;
  const ch = [m[1], m[2], m[3]].map((h) =>
    Math.max(0, Math.round(parseInt(h, 16) * (1 - amount)))
      .toString(16)
      .padStart(2, "0")
  );
  return `#${ch.join("")}`;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeName>(initialTheme);
  const [accent, setAccentState] = useState<string | null>(
    () => localStorage.getItem(K_ACCENT) || null
  );
  const [density, setDensityState] = useState<Density>(
    () => (localStorage.getItem(K_DENSITY) as Density) || "comfortable"
  );

  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-theme", theme);
    localStorage.setItem(K_THEME, theme);
  }, [theme]);

  useEffect(() => {
    const root = document.documentElement;
    if (accent) {
      root.style.setProperty("--color-primary", accent);
      root.style.setProperty("--color-primary-700", darken(accent));
      root.style.setProperty("--color-accent", accent);
      localStorage.setItem(K_ACCENT, accent);
    } else {
      root.style.removeProperty("--color-primary");
      root.style.removeProperty("--color-primary-700");
      root.style.removeProperty("--color-accent");
      localStorage.removeItem(K_ACCENT);
    }
  }, [accent]);

  useEffect(() => {
    document.documentElement.setAttribute("data-density", density);
    localStorage.setItem(K_DENSITY, density);
  }, [density]);

  const order: ThemeName[] = ["light", "dark", "high-contrast"];
  const value: ThemeState = {
    theme,
    accent,
    density,
    setTheme: setThemeState,
    setAccent: setAccentState,
    setDensity: setDensityState,
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
