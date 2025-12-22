import { create } from "zustand";
import { persist } from "zustand/middleware";
import yaml from "js-yaml";

export interface ManifestResult {
  success: boolean;
  stdout: string;
  stderr: string;
  exit_code: number | null;
}

export interface HistoryEntry {
  timestamp: number;
  content: string;
  label?: string;
}

export interface ResourceKey {
  kind: string;
  name: string;
  namespace?: string;
}

interface YamlEditorState {
  // Dialog state
  open: boolean;
  title: string;
  resourceKey: ResourceKey | null;

  // Content
  originalContent: string;
  editedContent: string;

  // UI state
  isLoading: boolean;
  isValidating: boolean;
  isApplying: boolean;
  showDiff: boolean;

  // Validation/Apply results
  validationResult: ManifestResult | null;
  applyResult: ManifestResult | null;

  // History (per resource, stored by key)
  history: Record<string, HistoryEntry[]>;

  // Actions
  openEditor: (params: {
    title: string;
    resourceKey: ResourceKey;
    fetchYaml: () => Promise<string>;
  }) => Promise<void>;
  closeEditor: () => void;
  setEditedContent: (content: string) => void;
  setShowDiff: (show: boolean) => void;
  setValidationResult: (result: ManifestResult | null) => void;
  setApplyResult: (result: ManifestResult | null) => void;
  setIsValidating: (validating: boolean) => void;
  setIsApplying: (applying: boolean) => void;
  addHistoryEntry: (content: string, label?: string) => void;
  restoreFromHistory: (timestamp: number) => void;
  getResourceHistory: () => HistoryEntry[];
  resetToOriginal: () => void;
  formatYaml: () => void;
}

const MAX_HISTORY_ENTRIES = 20;

function getResourceKeyString(key: ResourceKey | null): string {
  if (!key) return "";
  return `${key.kind}:${key.namespace || "cluster"}:${key.name}`;
}

export const useYamlEditorStore = create<YamlEditorState>()(
  persist(
    (set, get) => ({
      // Initial state
      open: false,
      title: "",
      resourceKey: null,
      originalContent: "",
      editedContent: "",
      isLoading: false,
      isValidating: false,
      isApplying: false,
      showDiff: false,
      validationResult: null,
      applyResult: null,
      history: {},

      openEditor: async ({ title, resourceKey, fetchYaml }) => {
        set({
          open: true,
          title,
          resourceKey,
          originalContent: "",
          editedContent: "",
          isLoading: true,
          validationResult: null,
          applyResult: null,
          showDiff: false,
        });

        try {
          const content = await fetchYaml();
          set({
            originalContent: content,
            editedContent: content,
            isLoading: false,
          });
        } catch (error) {
          set({
            open: false,
            isLoading: false,
          });
          throw error;
        }
      },

      closeEditor: () => {
        set({
          open: false,
          title: "",
          resourceKey: null,
          originalContent: "",
          editedContent: "",
          isLoading: false,
          isValidating: false,
          isApplying: false,
          validationResult: null,
          applyResult: null,
          showDiff: false,
        });
      },

      setEditedContent: (content) => {
        set({ editedContent: content, validationResult: null, applyResult: null });
      },

      setShowDiff: (show) => {
        set({ showDiff: show });
      },

      setValidationResult: (result) => {
        set({ validationResult: result });
      },

      setApplyResult: (result) => {
        set({ applyResult: result });
      },

      setIsValidating: (validating) => {
        set({ isValidating: validating });
      },

      setIsApplying: (applying) => {
        set({ isApplying: applying });
      },

      addHistoryEntry: (content, label) => {
        const { resourceKey, history } = get();
        const key = getResourceKeyString(resourceKey);
        if (!key) return;

        const currentHistory = history[key] || [];
        const newEntry: HistoryEntry = {
          timestamp: Date.now(),
          content,
          label,
        };

        // Add to front, limit size
        const updatedHistory = [newEntry, ...currentHistory].slice(0, MAX_HISTORY_ENTRIES);

        set({
          history: {
            ...history,
            [key]: updatedHistory,
          },
        });
      },

      restoreFromHistory: (timestamp) => {
        const { resourceKey, history } = get();
        const key = getResourceKeyString(resourceKey);
        if (!key) return;

        const entry = history[key]?.find((e) => e.timestamp === timestamp);
        if (entry) {
          set({
            editedContent: entry.content,
            validationResult: null,
            applyResult: null,
          });
        }
      },

      getResourceHistory: () => {
        const { resourceKey, history } = get();
        const key = getResourceKeyString(resourceKey);
        if (!key) return [];
        return history[key] || [];
      },

      resetToOriginal: () => {
        const { originalContent } = get();
        set({
          editedContent: originalContent,
          validationResult: null,
          applyResult: null,
        });
      },

      formatYaml: () => {
        const { editedContent } = get();
        try {
          const parsed = yaml.load(editedContent);
          const formatted = yaml.dump(parsed, {
            indent: 2,
            lineWidth: -1, // No line wrapping
            noRefs: true,
            sortKeys: false,
          });
          set({
            editedContent: formatted,
            validationResult: null,
            applyResult: null,
          });
        } catch {
          // If parsing fails, keep original content
        }
      },
    }),
    {
      name: "k8s-gui-yaml-editor",
      partialize: (state) => ({
        // Only persist history, not current editor state
        history: state.history,
      }),
    }
  )
);

