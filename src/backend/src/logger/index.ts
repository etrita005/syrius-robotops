import pino from "pino";
import type { Logger as PinoLogger, TransportTargetOptions } from "pino";

export type Logger = PinoLogger;

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
  level: "info",
  options: {
    file: "./logs/app",
    size: "500m",
    max: 0,
    mkdir: true,
  },
});

const rootLogger = pino({
  name: "robotops",
  level: process.env.LOG_LEVEL ?? (isDev ? "debug" : "info"),
  timestamp: pino.stdTimeFunctions.isoTime,
  transport: { targets },
});

export const logger: Logger = rootLogger;

export function createLogger(module: string): Logger {
  return rootLogger.child({ module });
}
