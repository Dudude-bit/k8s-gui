import { create } from "zustand";
import { persist } from "zustand/middleware";

export type TableDensity = "compact" | "comfortable";

interface DisplaySettingsState {
  tableDensity: TableDensity;
  setTableDensity: (density: TableDensity) => void;
}

export const useDisplaySettingsStore = create<DisplaySettingsState>()(
  persist(
    (set) => ({
      tableDensity: "comfortable",
      setTableDensity: (density) => set({ tableDensity: density }),
    }),
    {
      name: "display-settings",
    }
  )
);
