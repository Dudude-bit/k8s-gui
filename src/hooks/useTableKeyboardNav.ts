import { useCallback, useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";

/** Keyboard action mapping: key -> callback */
export interface KeyboardAction {
  /** Keyboard key (single character or key name) */
  key: string;
  /** Callback when key is pressed */
  onAction: (rowIndex: number) => void;
  /** Description for help text */
  label?: string;
}

interface UseTableKeyboardNavOptions {
  /** Total number of rows */
  rowCount: number;
  /** Generate href for row navigation */
  getRowHref?: (rowIndex: number) => string | undefined;
  /** Custom action on Enter key */
  onRowAction?: (rowIndex: number) => void;
  /** Whether keyboard navigation is enabled */
  enabled?: boolean;
  /** Custom keyboard actions */
  keyboardActions?: KeyboardAction[];
}

interface UseTableKeyboardNavReturn {
  /** Ref for the table container */
  containerRef: React.RefObject<HTMLDivElement | null>;
  /** Currently focused row index (-1 if none) */
  focusedRowIndex: number;
  /** Set focused row index */
  setFocusedRowIndex: (index: number) => void;
  /** Props to spread on each row */
  getRowProps: (index: number) => {
    tabIndex: number;
    "data-row-index": number;
    "data-focused": boolean;
    onFocus: () => void;
    onKeyDown: (e: React.KeyboardEvent) => void;
  };
}

export function useTableKeyboardNav({
  rowCount,
  getRowHref,
  onRowAction,
  enabled = true,
  keyboardActions = [],
}: UseTableKeyboardNavOptions): UseTableKeyboardNavReturn {
  const [focusedRowIndex, setFocusedRowIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  // Reset focus when row count changes
  useEffect(() => {
    if (focusedRowIndex >= rowCount) {
      setFocusedRowIndex(rowCount > 0 ? rowCount - 1 : -1);
    }
  }, [rowCount, focusedRowIndex]);

  const focusRow = useCallback((index: number) => {
    if (index < 0 || index >= rowCount) return;

    const rowElement = containerRef.current?.querySelector(
      `[data-row-index="${index}"]`
    ) as HTMLElement;

    if (rowElement) {
      rowElement.focus();
      setFocusedRowIndex(index);
    }
  }, [rowCount]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent, currentIndex: number) => {
      if (!enabled) return;

      // Check custom keyboard actions first
      const customAction = keyboardActions.find(
        (action) => action.key.toLowerCase() === e.key.toLowerCase()
      );
      if (customAction) {
        e.preventDefault();
        customAction.onAction(currentIndex);
        return;
      }

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          if (currentIndex < rowCount - 1) {
            focusRow(currentIndex + 1);
          }
          break;
        case "ArrowUp":
          e.preventDefault();
          if (currentIndex > 0) {
            focusRow(currentIndex - 1);
          }
          break;
        case "Enter":
          e.preventDefault();
          if (getRowHref) {
            const href = getRowHref(currentIndex);
            if (href) {
              navigate(href);
            }
          } else if (onRowAction) {
            onRowAction(currentIndex);
          }
          break;
        case "Home":
          e.preventDefault();
          focusRow(0);
          break;
        case "End":
          e.preventDefault();
          focusRow(rowCount - 1);
          break;
        case "Escape":
          e.preventDefault();
          setFocusedRowIndex(-1);
          (e.target as HTMLElement).blur();
          break;
      }
    },
    [enabled, rowCount, getRowHref, onRowAction, navigate, focusRow, keyboardActions]
  );

  const getRowProps = useCallback(
    (index: number) => ({
      tabIndex: focusedRowIndex === index || (focusedRowIndex === -1 && index === 0) ? 0 : -1,
      "data-row-index": index,
      "data-focused": focusedRowIndex === index,
      onFocus: () => setFocusedRowIndex(index),
      onKeyDown: (e: React.KeyboardEvent) => handleKeyDown(e, index),
    }),
    [focusedRowIndex, handleKeyDown]
  );

  return {
    containerRef,
    focusedRowIndex,
    setFocusedRowIndex,
    getRowProps,
  };
}
