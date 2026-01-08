import * as generatedCommands from "@/generated/commands";
import { normalizeTauriError } from "@/lib/error-utils";

type AsyncFn = (...args: unknown[]) => Promise<unknown>;
type Wrapped<T> = {
  [K in keyof T]: T[K] extends AsyncFn
    ? (...args: Parameters<T[K]>) => ReturnType<T[K]>
    : T[K];
};

export function wrapCommand<T extends AsyncFn>(
  fn: T,
  commandName?: string
): T {
  return (async (...args: Parameters<T>) => {
    try {
      return await fn(...args);
    } catch (error) {
      const name = commandName ?? (fn.name || "unknown");
      throw new Error(
        `Tauri command '${name}' failed: ${normalizeTauriError(error)}`
      );
    }
  }) as T;
}

export function createCommandsProxy<T extends Record<string, unknown>>(
  commands: T
): Wrapped<T> {
  const wrapped = new Map<PropertyKey, unknown>();

  return new Proxy(commands, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (typeof value !== "function") {
        return value;
      }
      if (wrapped.has(prop)) {
        return wrapped.get(prop);
      }
      const name = typeof prop === "string" ? prop : undefined;
      const wrappedFn = wrapCommand(value as AsyncFn, name);
      wrapped.set(prop, wrappedFn);
      return wrappedFn;
    },
  }) as Wrapped<T>;
}

export const commands = createCommandsProxy(generatedCommands);
