import { create } from "zustand";

const THEME_KEY = "nestlio:theme";

function getInitialDark(): boolean {
  const saved = localStorage.getItem(THEME_KEY);
  if (saved === "dark") return true;
  if (saved === "light") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

interface ThemeState {
  isDark: boolean;
  toggle: () => void;
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  isDark: getInitialDark(),
  toggle: () => {
    const next = !get().isDark;
    localStorage.setItem(THEME_KEY, next ? "dark" : "light");
    set({ isDark: next });
  },
}));
