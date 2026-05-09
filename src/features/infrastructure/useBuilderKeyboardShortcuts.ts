import { useEffect } from "react";
import type { Edge, Node } from "reactflow";

import type { ResourceNodeData } from "./types";

interface UseBuilderKeyboardShortcutsArgs {
  /** Hook is a no-op when not in visual mode. */
  enabled: boolean;
  nodes: Node<ResourceNodeData>[];
  edges: Edge[];
  setNodes: (next: Node<ResourceNodeData>[]) => void;
  setEdges: (next: Edge[]) => void;
  setSelection: (next: {
    nodes: Node<ResourceNodeData>[];
    edges: Edge[];
  }) => void;
  /** Fires on Delete / Backspace when something is selected. */
  onDeleteSelection: () => void;
}

const isTextInput = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  const tag = target.tagName.toLowerCase();
  return (
    tag === "input" ||
    tag === "textarea" ||
    tag === "select" ||
    target.isContentEditable
  );
};

/**
 * Window-level shortcuts for the builder canvas:
 * - Delete / Backspace → delete current selection
 * - Cmd/Ctrl+A → select all nodes & edges
 * - Cmd/Ctrl+Shift+I → invert selection
 *
 * All bypassed while focus is in a text input — the page-level inspector
 * panel and YAML editor live inside the same DOM tree, so without the
 * `isTextInput` guard the shortcuts would fire while the user is typing.
 */
export function useBuilderKeyboardShortcuts({
  enabled,
  nodes,
  edges,
  setNodes,
  setEdges,
  setSelection,
  onDeleteSelection,
}: UseBuilderKeyboardShortcutsArgs): void {
  useEffect(() => {
    if (!enabled) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (isTextInput(event.target)) {
        return;
      }

      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        onDeleteSelection();
        return;
      }

      const isSelectAll =
        (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "a";
      if (isSelectAll) {
        event.preventDefault();
        const selectedNodes = nodes.map((node) => ({
          ...node,
          selected: true,
        }));
        const selectedEdges = edges.map((edge) => ({
          ...edge,
          selected: true,
        }));
        setNodes(selectedNodes);
        setEdges(selectedEdges);
        setSelection({ nodes: selectedNodes, edges: selectedEdges });
        return;
      }

      const isInvert =
        (event.metaKey || event.ctrlKey) &&
        event.shiftKey &&
        event.key.toLowerCase() === "i";
      if (isInvert) {
        event.preventDefault();
        const invertedNodes = nodes.map((node) => ({
          ...node,
          selected: !node.selected,
        }));
        const invertedEdges = edges.map((edge) => ({
          ...edge,
          selected: !edge.selected,
        }));
        setNodes(invertedNodes);
        setEdges(invertedEdges);
        setSelection({
          nodes: invertedNodes.filter((node) => node.selected),
          edges: invertedEdges.filter((edge) => edge.selected),
        });
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [
    enabled,
    edges,
    nodes,
    onDeleteSelection,
    setEdges,
    setNodes,
    setSelection,
  ]);
}
