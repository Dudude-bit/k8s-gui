import { logEvent, type LogLevel } from "@/lib/logger";

type Cleanup = () => void;

const LOGGER_FLAG = "__k8sGuiFrontendLoggerInstalled";

const buildCircularReplacer = () => {
  const seen = new WeakSet<object>();
  return (_key: string, value: unknown) => {
    if (typeof value === "object" && value !== null) {
      if (seen.has(value as object)) {
        return "[Circular]";
      }
      seen.add(value as object);
    }
    return value;
  };
};

const serializeValue = (value: unknown) => {
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack };
  }

  if (typeof value === "object" && value !== null) {
    try {
      return JSON.parse(JSON.stringify(value, buildCircularReplacer()));
    } catch {
      return String(value);
    }
  }

  return value;
};

const formatMessage = (args: unknown[]) =>
  args
    .map((arg) => {
      if (typeof arg === "string") {
        return arg;
      }
      if (arg instanceof Error) {
        return arg.message;
      }
      try {
        return JSON.stringify(arg, buildCircularReplacer());
      } catch {
        return String(arg);
      }
    })
    .join(" ");

const formatData = (args: unknown[]) => {
  if (args.length === 0) {
    return null;
  }
  if (args.length === 1) {
    return serializeValue(args[0]);
  }
  return args.map(serializeValue);
};

function logFrontend(level: LogLevel, args: unknown[], context?: string) {
  const message = formatMessage(args);
  const data = formatData(args);
  logEvent(level, message, { context, data });
}

export function setupFrontendLogger(): Cleanup | undefined {
  if (typeof window === "undefined") {
    return;
  }

  const globalWindow = window as typeof window & {
    [LOGGER_FLAG]?: boolean;
  };

  if (globalWindow[LOGGER_FLAG]) {
    return;
  }

  globalWindow[LOGGER_FLAG] = true;

  const original = {
    log: console.log,
    debug: console.debug,
    info: console.info,
    warn: console.warn,
    error: console.error,
  };

  let isForwarding = false;

  const wrap =
    (level: LogLevel, fn: (...args: unknown[]) => void) =>
    (...args: unknown[]) => {
      fn(...args);

      if (isForwarding) {
        return;
      }

      isForwarding = true;
      const context = window.location?.pathname || "frontend";
      try {
        logFrontend(level, args, context);
      } finally {
        isForwarding = false;
      }
    };

  console.log = wrap("info", original.log);
  console.debug = wrap("debug", original.debug);
  console.info = wrap("info", original.info);
  console.warn = wrap("warn", original.warn);
  console.error = wrap("error", original.error);

  return () => {
    console.log = original.log;
    console.debug = original.debug;
    console.info = original.info;
    console.warn = original.warn;
    console.error = original.error;
  };
}
