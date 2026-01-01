import { invoke } from "@tauri-apps/api/core";
import { normalizeTauriError } from "./error-utils";

/**
 * Type-safe wrapper for Tauri invoke
 * Provides better type safety and error handling
 *
 * @param cmd - Tauri command name
 * @param args - Optional command arguments
 * @returns Promise resolving to the command result
 * @throws Error with normalized error message if command fails
 * @template T - Return type of the command
 */
export async function invokeTyped<T>(
  cmd: string,
  args?: Record<string, unknown>
): Promise<T> {
  try {
    return await invoke<T>(cmd, args);
  } catch (error) {
    // Normalize error message before re-throwing
    const errorMessage = normalizeTauriError(error);
    throw new Error(`Tauri command '${cmd}' failed: ${errorMessage}`);
  }
}
