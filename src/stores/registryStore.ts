import { create } from "zustand";

const REGISTRY_STORAGE_KEY = "k8s-gui:registry-configs";

export type RegistryProvider =
  | "docker-hub"
  | "registry-v2"
  | "harbor"
  | "gcr"
  | "ecr";

export interface RegistryConfig {
  id: string;
  label: string;
  provider: RegistryProvider;
  baseUrl?: string;
  host?: string;
  project?: string;
  accountId?: string;
  region?: string;
}

export interface RegistryAuth {
  authType: "none" | "basic" | "bearer";
  username?: string;
  password?: string;
  token?: string;
}

export interface RegistryAuthStatus {
  authType: RegistryAuth["authType"];
  username?: string;
  hasCredentials: boolean;
}

export interface RegistryImportEntry {
  server: string;
  host: string;
  baseUrl: string;
  isDockerHub: boolean;
  auth?: RegistryAuth | null;
}

export const DEFAULT_REGISTRIES: RegistryConfig[] = [
  { id: "docker-hub", label: "Docker Hub", provider: "docker-hub" },
];

const normalizeRegistryProvider = (provider: string) => {
  if (provider === "custom") {
    return "registry-v2";
  }
  return provider;
};

const ensureRegistryUrl = (input: string) => {
  const trimmed = input.trim();
  if (!trimmed) {
    return "";
  }
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  return `https://${trimmed}`;
};

const loadRegistryConfigs = (): RegistryConfig[] => {
  if (typeof window === "undefined") {
    return DEFAULT_REGISTRIES;
  }
  try {
    const raw = window.localStorage.getItem(REGISTRY_STORAGE_KEY);
    if (!raw) {
      return DEFAULT_REGISTRIES;
    }
    const parsed = JSON.parse(raw) as Array<
      Partial<RegistryConfig> & { type?: string }
    >;
    const sanitized = Array.isArray(parsed)
      ? parsed
          .filter(
            (entry) =>
              entry &&
              typeof entry.id === "string" &&
              typeof entry.label === "string",
          )
          .map((entry) => {
            const provider = normalizeRegistryProvider(
              (entry.provider ?? entry.type ?? "registry-v2") as string,
            );
            return {
              id: entry.id as string,
              label: entry.label as string,
              provider: provider as RegistryProvider,
              baseUrl: entry.baseUrl,
              host: entry.host,
              project: entry.project,
              accountId: entry.accountId,
              region: entry.region,
            } satisfies RegistryConfig;
          })
      : [];
    const hasDockerHub = sanitized.some((entry) => entry.id === "docker-hub");
    return hasDockerHub ? sanitized : [...DEFAULT_REGISTRIES, ...sanitized];
  } catch {
    return DEFAULT_REGISTRIES;
  }
};

const saveRegistryConfigs = (configs: RegistryConfig[]) => {
  if (typeof window === "undefined") {
    return;
  }
  try {
    const payload = configs.filter((entry) => entry.id !== "docker-hub");
    window.localStorage.setItem(REGISTRY_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Avoid blocking when storage is unavailable.
  }
};

interface RegistryState {
  registries: RegistryConfig[];
  selectedRegistryId: string;
  setSelectedRegistryId: (id: string) => void;
  addRegistry: (config: Omit<RegistryConfig, "id">) => RegistryConfig;
  updateRegistry: (id: string, updates: Partial<RegistryConfig>) => void;
  removeRegistry: (id: string) => void;
  ensureRegistryUrl: (input: string) => string;
}

const initialRegistries = loadRegistryConfigs();

export const useRegistryStore = create<RegistryState>((set, get) => ({
  registries: initialRegistries,
  selectedRegistryId: initialRegistries[0]?.id ?? DEFAULT_REGISTRIES[0].id,

  setSelectedRegistryId: (id) => {
    if (!get().registries.some((registry) => registry.id === id)) {
      return;
    }
    set({ selectedRegistryId: id });
  },

  addRegistry: (config) => {
    const nextRegistry: RegistryConfig = {
      ...config,
      id: `custom-${crypto.randomUUID()}`,
    };
    const registries = [...get().registries, nextRegistry];
    saveRegistryConfigs(registries);
    set({ registries, selectedRegistryId: nextRegistry.id });
    return nextRegistry;
  },

  updateRegistry: (id, updates) => {
    const registries = get().registries.map((registry) =>
      registry.id === id ? { ...registry, ...updates } : registry,
    );
    saveRegistryConfigs(registries);
    set({ registries });
  },

  removeRegistry: (id) => {
    if (id === "docker-hub") {
      return;
    }
    const registries = get().registries.filter(
      (registry) => registry.id !== id,
    );
    const selectedRegistryId =
      get().selectedRegistryId === id
        ? (registries[0]?.id ?? "docker-hub")
        : get().selectedRegistryId;
    saveRegistryConfigs(registries);
    set({ registries, selectedRegistryId });
  },

  ensureRegistryUrl,
}));
