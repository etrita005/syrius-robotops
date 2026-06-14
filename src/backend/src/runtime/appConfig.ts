import { access, readFile } from "node:fs/promises";
import { constants } from "node:fs";
import { isAbsolute, join } from "node:path";

export type LogLevel = "trace" | "debug" | "info" | "warn" | "error" | "fatal";

export interface AppConfig {
  server: {
    host: string;
    port: number;
  };
  database: {
    path: string;
  };
  security: {
    secret: string;
  };
  logs: {
    level: LogLevel;
    dir: string;
  };
  runtime: {
    mock: boolean;
  };
}

export interface RuntimePaths {
  executableDir: string;
  configPath: string;
  staticRoot: string;
}

interface CliOverrides {
  port?: number;
  dataDir?: string;
  mock?: boolean;
  healthCheck?: boolean;
  version?: boolean;
}

const defaultAppConfig: AppConfig = {
  server: {
    host: "127.0.0.1",
    port: 30001,
  },
  database: {
    path: "./data",
  },
  security: {
    secret: "change-me",
  },
  logs: {
    level: "info",
    dir: "./logs",
  },
  runtime: {
    mock: false,
  },
};

const logLevels = new Set<LogLevel>(["trace", "debug", "info", "warn", "error", "fatal"]);

function isPkgRuntime(): boolean {
  return Boolean((process as NodeJS.Process & { pkg?: unknown }).pkg);
}

export function resolveRuntimePaths(): RuntimePaths {
  const executableDir = isPkgRuntime() ? join(process.execPath, "..") : process.cwd();
  const staticRoot = join(import.meta.dirname!, "../../dist-static/");
  return {
    executableDir,
    configPath: join(executableDir, "config.json"),
    staticRoot,
  };
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function mergeConfig(base: AppConfig, patch: unknown): AppConfig {
  if (!isRecord(patch)) {
    return base;
  }

  return {
    server: {
      ...base.server,
      ...(isRecord(patch.server) ? patch.server : {}),
    },
    database: {
      ...base.database,
      ...(isRecord(patch.database) ? patch.database : {}),
    },
    security: {
      ...base.security,
      ...(isRecord(patch.security) ? patch.security : {}),
    },
    logs: {
      ...base.logs,
      ...(isRecord(patch.logs) ? patch.logs : {}),
    },
    runtime: {
      ...base.runtime,
      ...(isRecord(patch.runtime) ? patch.runtime : {}),
    },
  } as AppConfig;
}

function resolveMaybeRelative(baseDir: string, value: string): string {
  return isAbsolute(value) ? value : join(baseDir, value);
}

function validateConfig(config: AppConfig): void {
  if (typeof config.server.host !== "string" || config.server.host.length === 0) {
    throw new Error("Invalid configuration field: server.host");
  }
  if (!Number.isInteger(config.server.port) || config.server.port < 1 || config.server.port > 65535) {
    throw new Error("Invalid configuration field: server.port");
  }
  if (typeof config.database.path !== "string" || config.database.path.length === 0) {
    throw new Error("Invalid configuration field: database.path");
  }
  if (typeof config.security.secret !== "string" || config.security.secret.length === 0) {
    throw new Error("Invalid configuration field: security.secret");
  }
  if (!logLevels.has(config.logs.level)) {
    throw new Error("Invalid configuration field: logs.level");
  }
  if (typeof config.logs.dir !== "string" || config.logs.dir.length === 0) {
    throw new Error("Invalid configuration field: logs.dir");
  }
  if (typeof config.runtime.mock !== "boolean") {
    throw new Error("Invalid configuration field: runtime.mock");
  }
}

export function parseCliArgs(args = process.argv.slice(2)): CliOverrides {
  const overrides: CliOverrides = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if ((arg === "--port" || arg === "-p") && i + 1 < args.length) {
      const port = Number.parseInt(args[++i], 10);
      if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw new Error("Invalid command line argument: --port");
      }
      overrides.port = port;
    } else if ((arg === "--data-dir" || arg === "-d") && i + 1 < args.length) {
      overrides.dataDir = args[++i];
    } else if (arg === "--mock" || arg === "-m") {
      overrides.mock = true;
    } else if (arg === "--health-check") {
      overrides.healthCheck = true;
    } else if (arg === "--version" || arg === "-v") {
      overrides.version = true;
    }
  }
  return overrides;
}

export async function loadAppConfig(runtimePaths: RuntimePaths, overrides: CliOverrides): Promise<{ config: AppConfig; configLoaded: boolean }> {
  let config = defaultAppConfig;
  let configLoaded = false;

  if (await fileExists(runtimePaths.configPath)) {
    const raw = await readFile(runtimePaths.configPath, "utf8");
    config = mergeConfig(config, JSON.parse(raw));
    configLoaded = true;
  }

  if (overrides.port !== undefined) {
    config.server.port = overrides.port;
  }
  if (overrides.dataDir !== undefined) {
    config.database.path = overrides.dataDir;
  }
  if (overrides.mock !== undefined) {
    config.runtime.mock = overrides.mock;
  }

  validateConfig(config);
  config = {
    ...config,
    database: {
      path: resolveMaybeRelative(runtimePaths.executableDir, config.database.path),
    },
    logs: {
      ...config.logs,
      dir: resolveMaybeRelative(runtimePaths.executableDir, config.logs.dir),
    },
  };

  return { config, configLoaded };
}
