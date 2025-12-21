import { create } from 'zustand';

interface YamlViewerOptions {
  title: string;
  description?: string;
  fetchYaml: () => Promise<string>;
}

interface YamlViewerState {
  open: boolean;
  title: string;
  description?: string;
  content: string;
  isLoading: boolean;
  openViewer: (options: YamlViewerOptions) => Promise<void>;
  closeViewer: () => void;
}

export const useYamlViewerStore = create<YamlViewerState>((set) => ({
  open: false,
  title: '',
  description: undefined,
  content: '',
  isLoading: false,
  openViewer: async ({ title, description, fetchYaml }) => {
    set({
      open: true,
      title,
      description,
      content: '',
      isLoading: true,
    });

    try {
      const content = await fetchYaml();
      set({ content, isLoading: false });
    } catch (error) {
      set({
        open: false,
        title: '',
        description: undefined,
        content: '',
        isLoading: false,
      });
      throw error;
    }
  },
  closeViewer: () => {
    set({
      open: false,
      title: '',
      description: undefined,
      content: '',
      isLoading: false,
    });
  },
}));
