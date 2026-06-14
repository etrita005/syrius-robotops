import pino from "pino";
import type { Logger as PinoLogger, TransportTargetOptions } from "pino";
import { pathToFileURL } from "node:url";
import { mkdirSync, createWriteStream } from "node:fs";
import { join } from "node:path";

import "pino-pretty";

export type Logger = PinoLogger;

export interface LoggerOptions {
  level?: string;
  logsDir?: string;
}

function isPkgRuntime(): boolean {
  return Boolean((process as NodeJS.Process & { pkg?: unknown }).pkg);
}

let rootLogger: Logger = createRootLogger();

function createRootLogger(options: LoggerOptions = {}): Logger {
  const isPkg = isPkgRuntime();
  const isDev = process.env.NODE_ENV !== "production" && !isPkg;
  const level = options.level ?? process.env.LOG_LEVEL ?? (isDev ? "debug" : "info");
  const logsDir = options.logsDir ?? "./logs";

  mkdirSync(logsDir, { recursive: true });
  const logFile = join(logsDir, "app.log");

  if (isPkg) {
    const fileDest = pino.destination({ dest: logFile, sync: true });
    const stdoutDest = pino.destination({ dest: 1, sync: true });
    return pino({
      name: "robotops",
      level,
      timestamp: pino.stdTimeFunctions.isoTime,
    }, pino.multistream([{ stream: stdoutDest, level: "info" }, { stream: fileDest }]));
  }

  const transports: TransportTargetOptions[] = [];

  if (isDev) {
    transports.push({
      target: pathToFileURL(require.resolve("pino-pretty")).href,
      level: "debug",
      options: {
        colorize: true,
        translateTime: "SYS:HH:MM:ss.l",
        ignore: "pid,hostname",
        singleLine: true,
      },
    });
  }

  transports.push({
    target: "pino/file",
    level,
    options: {
      destination: logFile,
      mkdir: true,
    },
  });

  return pino({
    name: "robotops",
    level,
    timestamp: pino.stdTimeFunctions.isoTime,
    transport: {
      targets: transports,
    },
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
