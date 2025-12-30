/**
 * Theme Store
 *
 * Manages the application's color theme with persistence.
 * Supports light, dark, and system-preference themes.
 *
 * @module stores/themeStore
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";

/** Available theme options */
type Theme = "light" | "dark" | "system";

/** Theme store state and actions */
interface ThemeState {
  /** Current theme setting */
  theme: Theme;
  /** Set the active theme */
  setTheme: (theme: Theme) => void;
}

/**
 * Zustand store for theme management
 *
 * @example
 * ```tsx
 * const { theme, setTheme } = useThemeStore();
 * setTheme("dark");
 * ```
 */
export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      theme: "dark",
      setTheme: (theme) => set({ theme }),
    }),
    {
      name: "k8s-gui-theme",
    }
  )
);
