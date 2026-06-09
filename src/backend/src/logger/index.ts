import pino from "pino";
import type { Logger as PinoLogger, TransportTargetOptions } from "pino";

export type Logger = PinoLogger;

export interface LoggerOptions {
  level?: string;
  logsDir?: string;
}

let rootLogger: Logger = createRootLogger();

function createRootLogger(options: LoggerOptions = {}): Logger {
  const isDev = process.env.NODE_ENV !== "production";
  const targets: TransportTargetOptions[] = [];

  if (isDev) {
    targets.push({
      target: "pino-pretty",
      level: "debug",
      options: {
        colorize: true,
        translateTime: "SYS:HH:MM:ss.l",
        ignore: "pid,hostname",
      },
    });
  }

  targets.push({
    target: "pino-roll",
    level: options.level ?? "info",
    options: {
      file: `${options.logsDir ?? "./logs"}/app`,
      size: "500m",
      max: 0,
      mkdir: true,
    },
  });

  return pino({
    name: "robotops",
    level: options.level ?? process.env.LOG_LEVEL ?? (isDev ? "debug" : "info"),
    timestamp: pino.stdTimeFunctions.isoTime,
    transport: { targets },
  });
}

export const logger: Logger = new Proxy({} as Logger, {
  get(_target, prop, receiver) {
    const value = Reflect.get(rootLogger, prop, receiver) as unknown;
    return typeof value === "function" ? value.bind(rootLogger) : value;
  },
});

export function configureLogger(options: LoggerOptions): void {
  rootLogger = createRootLogger(options);
}

export function createLogger(module: string): Logger {
  return rootLogger.child({ module });
}
