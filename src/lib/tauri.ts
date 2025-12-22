import { invoke } from "@tauri-apps/api/core";
import { normalizeTauriError } from "./error-utils";

/**
 * Type-safe wrapper for Tauri invoke
 * Provides better type safety and error handling
 */
export async function invokeTyped<T>(
  cmd: string,
  args?: Record<string, unknown>,
): Promise<T> {
  try {
    return await invoke<T>(cmd, args);
  } catch (error) {
    // Normalize error message before re-throwing
    const errorMessage = normalizeTauriError(error);
    throw new Error(`Tauri command '${cmd}' failed: ${errorMessage}`);
  }
}

/**
 * Helper to create type-safe command functions
 */
export function createTauriCommand<T>(
  cmd: string,
): (args?: Record<string, unknown>) => Promise<T> {
  return (args?: Record<string, unknown>) => invokeTyped<T>(cmd, args);
}

