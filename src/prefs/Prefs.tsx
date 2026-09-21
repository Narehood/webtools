import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useState, type ReactNode } from "react";
import { getTool } from "../data/tools";

export type ThemeMode = "light" | "dark" | "system";

export const ACCENT_DEFAULT = "#1ea54c";

export const ACCENTS = [
  { id: "green", label: "Green", value: "#1ea54c" },
  { id: "teal", label: "Teal", value: "#0f766e" },
  { id: "blue", label: "Blue", value: "#0369a1" },
  { id: "violet", label: "Violet", value: "#6d28d9" },
  { id: "amber", label: "Amber", value: "#b45309" },
  { id: "rose", label: "Rose", value: "#be123c" },
] as const;

const THEME_KEY = "webtools.theme";
const ACCENT_KEY = "webtools.accent";
const FAVORITES_KEY = "webtools.favorites";
const RECENT_KEY = "webtools.recent";
const RECENT_LIMIT = 6;

type Prefs = {
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
  accent: string;
  setAccent: (accent: string) => void;
  favorites: string[];
  isFavorite: (slug: string) => boolean;
  toggleFavorite: (slug: string) => void;
  clearFavorites: () => void;
  recent: string[];
  rememberTool: (slug: string) => void;
  clearRecent: () => void;
};

const PrefsContext = createContext<Prefs | null>(null);

function readStorage(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private mode and blocked storage keep the in-memory choice */
  }
}

export function normalizeAccent(value: string | null) {
  return value && /^#[0-9a-fA-F]{6}$/.test(value) ? value.toLowerCase() : ACCENT_DEFAULT;
}

export function loadTheme(): ThemeMode {
  const value = readStorage(THEME_KEY);
  return value === "light" || value === "dark" || value === "system" ? value : "dark";
}

function loadSlugs(key: string, unique: boolean) {
  try {
    const parsed: unknown = JSON.parse(readStorage(key) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    const slugs = parsed.filter((item): item is string => typeof item === "string" && Boolean(getTool(item)));
    return unique ? [...new Set(slugs)] : slugs.filter((slug, index) => slugs.indexOf(slug) === index);
  } catch {
    return [];
  }
}

export function loadFavorites() {
  return loadSlugs(FAVORITES_KEY, true);
}

export function loadRecent() {
  return loadSlugs(RECENT_KEY, true).slice(0, RECENT_LIMIT);
}

function systemTheme(): "light" | "dark" {
  if (typeof matchMedia !== "function") return "dark";
  return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function hexToRgba(hex: string, alpha: number) {
  const value = hex.replace("#", "");
  const red = parseInt(value.slice(0, 2), 16);
  const green = parseInt(value.slice(2, 4), 16);
  const blue = parseInt(value.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

export function accentInk(hex: string) {
  const value = hex.replace("#", "");
  const channel = (start: number) => {
    const piece = parseInt(value.slice(start, start + 2), 16) / 255;
    return piece <= 0.03928 ? piece / 12.92 : ((piece + 0.055) / 1.055) ** 2.4;
  };
  const luminance = 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
  return luminance > 0.45 ? "#1a1612" : "#ffffff";
}

export function applyPrefs(theme: ThemeMode, accent: string) {
  if (typeof document === "undefined") return;
  const resolved = theme === "system" ? systemTheme() : theme;
  const safe = normalizeAccent(accent);
  const root = document.documentElement;
  root.dataset.theme = resolved;
  root.style.colorScheme = resolved;
  root.style.setProperty("--accent", safe);
  root.style.setProperty("--accent-dim", hexToRgba(safe, 0.16));
  root.style.setProperty("--brass", safe);
  root.style.setProperty("--brass-dim", hexToRgba(safe, 0.16));
  root.style.setProperty("--accent-ink", accentInk(safe));
}

export function bootPrefs() {
  applyPrefs(loadTheme(), normalizeAccent(readStorage(ACCENT_KEY)));
}

export function PrefsProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<ThemeMode>(loadTheme);
  const [accent, setAccentState] = useState(() => normalizeAccent(readStorage(ACCENT_KEY)));
  const [favorites, setFavorites] = useState<string[]>(loadFavorites);
  const [recent, setRecent] = useState<string[]>(loadRecent);

  useLayoutEffect(() => {
    applyPrefs(theme, accent);
    writeStorage(THEME_KEY, theme);
    writeStorage(ACCENT_KEY, accent);
  }, [theme, accent]);

  useEffect(() => {
    if (theme !== "system" || typeof matchMedia !== "function") return;
    const media = matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyPrefs("system", accent);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [theme, accent]);

  useEffect(() => {
    writeStorage(FAVORITES_KEY, JSON.stringify(favorites));
  }, [favorites]);

  useEffect(() => {
    writeStorage(RECENT_KEY, JSON.stringify(recent));
  }, [recent]);

  const rememberTool = useCallback((slug: string) => {
    if (!getTool(slug)) return;
    setRecent((current) => {
      const next = [slug, ...current.filter((item) => item !== slug)].slice(0, RECENT_LIMIT);
      if (next.length === current.length && next.every((item, index) => item === current[index])) return current;
      return next;
    });
  }, []);

  const value = useMemo<Prefs>(() => ({
    theme,
    setTheme,
    accent,
    setAccent: (next) => setAccentState(normalizeAccent(next)),
    favorites,
    isFavorite: (slug) => favorites.includes(slug),
    toggleFavorite: (slug) => {
      if (!getTool(slug)) return;
      setFavorites((current) => current.includes(slug) ? current.filter((item) => item !== slug) : [...current, slug]);
    },
    clearFavorites: () => setFavorites([]),
    recent,
    rememberTool,
    clearRecent: () => setRecent([]),
  }), [theme, accent, favorites, recent, rememberTool]);

  return <PrefsContext.Provider value={value}>{children}</PrefsContext.Provider>;
}

export function usePrefs() {
  const value = useContext(PrefsContext);
  if (!value) throw new Error("usePrefs must be used within PrefsProvider");
  return value;
}
