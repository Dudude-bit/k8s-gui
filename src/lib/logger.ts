import { logFrontendEvent } from "@/generated/commands";

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogOptions {
  context?: string;
  data?: unknown;
}

const serializeError = (value: unknown) => {
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack };
  }
  return value;
};

export function logEvent(
  level: LogLevel,
  message: string,
  options?: LogOptions
) {
  const context = options?.context ?? null;
  const data =
    options?.data !== undefined ? serializeError(options.data) : null;

  logFrontendEvent(level, message, context, data).catch(() => undefined);
}

export const logDebug = (message: string, options?: LogOptions) =>
  logEvent("debug", message, options);
export const logInfo = (message: string, options?: LogOptions) =>
  logEvent("info", message, options);
export const logWarn = (message: string, options?: LogOptions) =>
  logEvent("warn", message, options);
export const logError = (message: string, options?: LogOptions) =>
  logEvent("error", message, options);
