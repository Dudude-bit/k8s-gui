import { create } from "zustand";
import {
  addEdge as addFlowEdge,
  applyEdgeChanges,
  applyNodeChanges,
  Edge,
  Node,
  NodeChange,
  EdgeChange,
  Connection,
  XYPosition,
} from "reactflow";
import {
  buildEdgesFromResources,
  buildManifestYaml,
  createDefaultResourceData,
  parseManifestYaml,
} from "@/features/infrastructure/utils";
import {
  ResourceKind,
  ResourceNodeData,
} from "@/features/infrastructure/types";

const STORAGE_PREFIX = "k8s-gui.infrastructure-builder";
const GRID_SPACING_X = 260;
const GRID_SPACING_Y = 180;

interface StoredBuilderState {
  nodes: Node<ResourceNodeData>[];
  edges: Edge[];
  yamlText: string;
  extraManifests: unknown[];
}

interface SyncResult {
  success: boolean;
  message?: string;
}

interface InfrastructureBuilderState extends StoredBuilderState {
  context: string | null;
  selectedNodeId: string | null;
  setContext: (context: string | null) => void;
  setYamlText: (text: string) => void;
  setNodes: (nodes: Node<ResourceNodeData>[]) => void;
  setEdges: (edges: Edge[]) => void;
  onNodesChange: (changes: NodeChange[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  onConnect: (connection: Connection) => void;
  addResource: (
    kind: ResourceKind,
    position: XYPosition,
    namespace: string
  ) => Node<ResourceNodeData>;
  updateNode: (nodeId: string, updates: Partial<ResourceNodeData>) => void;
  removeNode: (nodeId: string) => void;
  clearCanvas: () => void;
  setSelectedNodeId: (nodeId: string | null) => void;
  syncFromYaml: () => SyncResult;
  syncToYaml: () => string;
  replaceResources: (nodes: Node<ResourceNodeData>[], edges: Edge[]) => void;
}

const storageKey = (context: string) => `${STORAGE_PREFIX}.${context}`;

const emptyState: StoredBuilderState = {
  nodes: [],
  edges: [],
  yamlText: "",
  extraManifests: [],
};

const loadState = (context: string): StoredBuilderState => {
  if (typeof window === "undefined") {
    return emptyState;
  }
  try {
    const raw = window.localStorage.getItem(storageKey(context));
    if (!raw) {
      return emptyState;
    }
    const parsed = JSON.parse(raw) as StoredBuilderState;
    return {
      nodes: Array.isArray(parsed.nodes) ? parsed.nodes : [],
      edges: Array.isArray(parsed.edges) ? parsed.edges : [],
      yamlText: typeof parsed.yamlText === "string" ? parsed.yamlText : "",
      extraManifests: Array.isArray(parsed.extraManifests)
        ? parsed.extraManifests
        : [],
    };
  } catch (error) {
    console.warn("Failed to load infrastructure builder state:", error);
    return emptyState;
  }
};

const persistState = (state: InfrastructureBuilderState) => {
  if (!state.context || typeof window === "undefined") {
    return;
  }
  const payload: StoredBuilderState = {
    nodes: state.nodes,
    edges: state.edges,
    yamlText: state.yamlText,
    extraManifests: state.extraManifests,
  };
  try {
    window.localStorage.setItem(
      storageKey(state.context),
      JSON.stringify(payload)
    );
  } catch (error) {
    console.warn("Failed to persist infrastructure builder state:", error);
  }
};

const resourceKey = (data: ResourceNodeData) =>
  `${data.kind}:${data.namespace || "default"}:${data.name}`;

const layoutPosition = (index: number) => ({
  x: (index % 4) * GRID_SPACING_X,
  y: Math.floor(index / 4) * GRID_SPACING_Y,
});

const createResourceName = (
  kind: ResourceKind,
  nodes: Node<ResourceNodeData>[]
) => {
  const base = kind.toLowerCase();
  const existing = new Set(nodes.map((node) => node.data.name));
  let attempt = 0;
  while (attempt < 1000) {
    const suffix = crypto.randomUUID().split("-")[0];
    const candidate = `${base}-${attempt + 1}-${suffix}`;
    if (!existing.has(candidate)) {
      return candidate;
    }
    attempt += 1;
  }
  return `${base}-${crypto.randomUUID()}`;
};

export const useInfrastructureBuilderStore = create<InfrastructureBuilderState>(
  (set, get) => ({
    context: null,
    selectedNodeId: null,
    ...emptyState,

    setContext: (context) => {
      set((state) => {
        if (!context) {
          return {
            ...state,
            context: null,
            selectedNodeId: null,
            ...emptyState,
          };
        }
        if (state.context === context) {
          return state;
        }
        const stored = loadState(context);
        return {
          ...state,
          context,
          selectedNodeId: null,
          ...stored,
        };
      });
    },

    setYamlText: (text) => {
      set((state) => {
        const next = { ...state, yamlText: text };
        persistState(next);
        return next;
      });
    },

    setNodes: (nodes) => {
      set((state) => {
        const next = { ...state, nodes };
        persistState(next);
        return next;
      });
    },

    setEdges: (edges) => {
      set((state) => {
        const next = { ...state, edges };
        persistState(next);
        return next;
      });
    },

    replaceResources: (nodes, edges) => {
      set((state) => {
        const next = { ...state, nodes, edges };
        persistState(next);
        return next;
      });
    },

    onNodesChange: (changes) => {
      set((state) => {
        const nodes = applyNodeChanges(changes, state.nodes);
        const next = { ...state, nodes };
        persistState(next);
        return next;
      });
    },

    onEdgesChange: (changes) => {
      set((state) => {
        const edges = applyEdgeChanges(changes, state.edges);
        const next = { ...state, edges };
        persistState(next);
        return next;
      });
    },

    onConnect: (connection) => {
      set((state) => {
        const edges = addFlowEdge(
          { ...connection, type: "smoothstep" },
          state.edges
        );
        const next = { ...state, edges };
        persistState(next);
        return next;
      });
    },

    addResource: (kind, position, namespace) => {
      const name = createResourceName(kind, get().nodes);
      const data = createDefaultResourceData(kind, name, namespace);
      const node: Node<ResourceNodeData> = {
        id: crypto.randomUUID(),
        type: "resource",
        position,
        data,
      };
      set((state) => {
        const next = { ...state, nodes: [...state.nodes, node] };
        persistState(next);
        return next;
      });
      return node;
    },

    updateNode: (nodeId, updates) => {
      set((state) => {
        const nodes = state.nodes.map((node) =>
          node.id === nodeId
            ? {
                ...node,
                data: { ...node.data, ...updates } as ResourceNodeData,
              }
            : node
        );
        const next = { ...state, nodes };
        persistState(next);
        return next;
      });
    },

    removeNode: (nodeId) => {
      set((state) => {
        const nodes = state.nodes.filter((node) => node.id !== nodeId);
        const edges = state.edges.filter(
          (edge) => edge.source !== nodeId && edge.target !== nodeId
        );
        const next = { ...state, nodes, edges, selectedNodeId: null };
        persistState(next);
        return next;
      });
    },

    clearCanvas: () => {
      set((state) => {
        const next = {
          ...state,
          nodes: [],
          edges: [],
          yamlText: "",
          extraManifests: [],
          selectedNodeId: null,
        };
        persistState(next);
        return next;
      });
    },

    setSelectedNodeId: (nodeId) => {
      set({ selectedNodeId: nodeId });
    },

    syncFromYaml: () => {
      const { yamlText, nodes: currentNodes } = get();
      const parsed = parseManifestYaml(yamlText);
      if (parsed.errors.length) {
        return { success: false, message: parsed.errors.join("\n") };
      }

      const positionByKey = new Map(
        currentNodes.map((node) => [resourceKey(node.data), node.position])
      );

      const nodes: Node<ResourceNodeData>[] = parsed.resources.map(
        (resource, index) => {
          const key = resourceKey(resource);
          const position = positionByKey.get(key) ?? layoutPosition(index);
          return {
            id: crypto.randomUUID(),
            type: "resource",
            position,
            data: resource,
          };
        }
      );

      const edges = buildEdgesFromResources(nodes);

      set((state) => {
        const next = {
          ...state,
          nodes,
          edges,
          extraManifests: parsed.extraManifests,
          selectedNodeId: null,
        };
        persistState(next);
        return next;
      });

      return { success: true };
    },

    syncToYaml: () => {
      const { nodes, extraManifests } = get();
      const yamlText = buildManifestYaml(
        nodes.map((node) => node.data),
        extraManifests
      );
      set((state) => {
        const next = { ...state, yamlText };
        persistState(next);
        return next;
      });
      return yamlText;
    },
  })
);
