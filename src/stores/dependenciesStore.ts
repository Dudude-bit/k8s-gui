/**
 * Dependencies Store
 *
 * Manages external CLI dependencies availability status (helm, kubectl, etc.)
 * Checks on app startup and caches results.
 *
 * @module stores/dependenciesStore
 */

import { create } from "zustand";
import { commands } from "@/lib/commands";

/** Helm CLI availability status */
export interface HelmAvailability {
  available: boolean;
  version: string | null;
  error: string | null;
  /** Path where helm was found (if available) */
  path: string | null;
  /** List of paths that were searched */
  searchedPaths: string[];
}

/** Dependencies store state */
interface DependenciesState {
  helm: HelmAvailability | null;
  isChecking: boolean;
  lastChecked: Date | null;

  // Actions
  checkHelmAvailability: () => Promise<void>;
  checkAllDependencies: () => Promise<void>;
}

export const useDependenciesStore = create<DependenciesState>((set, get) => ({
  helm: null,
  isChecking: false,
  lastChecked: null,

  checkHelmAvailability: async () => {
    set({ isChecking: true });
    try {
      const result = await commands.checkHelmAvailability();
      set({
        helm: result,
        isChecking: false,
        lastChecked: new Date(),
      });
    } catch (error) {
      set({
        helm: {
          available: false,
          version: null,
          error: error instanceof Error ? error.message : String(error),
          path: null,
          searchedPaths: [],
        },
        isChecking: false,
        lastChecked: new Date(),
      });
    }
  },

  checkAllDependencies: async () => {
    const { checkHelmAvailability } = get();
    await checkHelmAvailability();
    // Add more dependency checks here as needed
  },
}));
