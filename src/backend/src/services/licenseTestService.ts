import { Client } from "ssh2";
import { SSH_USERNAME, SSH_PASSWORD } from "../config.js";
import { createLogger } from "../logger/index.js";
import {
  LicenseConfig,
  LicenseTestSession,
  LICENSE_KEYS,
  VALID_LICENSE_TYPES,
  LICENSE_KEY_LICENSES,
  LICENSE_KEY_TYPE,
  LICENSE_KEY_AUTH_START,
} from "../types/licenseTest.js";

interface SshResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
}

export interface ILicenseTestService {
  connect(ip: string, port: number): Promise<LicenseConfig>;
  disconnect(): Promise<void>;
  getSession(): Promise<LicenseTestSession | null>;
  readConfig(): Promise<LicenseConfig>;
  applyConfig(config: LicenseConfig): Promise<void>;
}

const CONTENT_URI = "content://com.syriusrobotics.platform.launcher.mockkv/kv";

function escapeShellValue(value: string): string {
  return value.replace(/'/g, "'\\''");
}

function escapeSqlValue(value: string): string {
  return value.replace(/'/g, "''");
}

function readKeyCommand(key: string): string {
  return `adb shell content query --uri ${CONTENT_URI}/${key}`;
}

function insertKeyCommand(key: string, value: string): string {
  return `adb shell content insert --uri ${CONTENT_URI} --bind key:s:${key} --bind value:s:'${escapeShellValue(value)}'`;
}

function updateKeyCommand(key: string, value: string): string {
  return `adb shell content update --uri ${CONTENT_URI} --bind value:s:'${escapeShellValue(value)}' --where "key='${escapeSqlValue(key)}'"`;
}

function parseQueryOutput(stdout: string): string {
  const match = stdout.match(/Row: \d+ key=[^,]*,\s*value=(.*)/);
  if (!match || !match[1]) return "";
  return match[1].trim();
}

export class LicenseTestService implements ILicenseTestService {
  private session: LicenseTestSession | null = null;
  private log = createLogger("LicenseTest");

  private requireSession(): LicenseTestSession {
    if (!this.session) {
      throw new NoSessionError();
    }
    return this.session;
  }

  private executeSsh(
    host: string,
    port: number,
    command: string,
    connectTimeout: number,
    commandTimeout: number
  ): Promise<SshResult> {
    const log = this.log;
    return new Promise((resolve, reject) => {
      const conn = new Client();
      let commandTimer: ReturnType<typeof setTimeout> | undefined;

      const connectTimer = setTimeout(() => {
        conn.end();
        reject(new RobotTimeoutError(`SSH connection timed out after ${connectTimeout}ms`));
      }, connectTimeout);

      conn
        .on("ready", () => {
          clearTimeout(connectTimer);
          conn.exec(command, (err, stream) => {
            if (err) {
              conn.end();
              reject(new RobotCommandError(`SSH exec failed: ${err.message}`));
              return;
            }

            let stdout = "";
            let stderr = "";

            commandTimer = setTimeout(() => {
              conn.end();
              reject(new RobotTimeoutError(`SSH command timed out after ${commandTimeout}ms`));
            }, commandTimeout);

            stream.on("data", (data: Buffer) => {
              const text = data.toString("utf-8");
              stdout += text;
              log.info({ host, port, stream: "stdout" }, text.trimEnd());
            });

            stream.stderr.on("data", (data: Buffer) => {
              const text = data.toString("utf-8");
              stderr += text;
              log.info({ host, port, stream: "stderr" }, text.trimEnd());
            });

            stream.on("close", (code: number | null) => {
              if (commandTimer) clearTimeout(commandTimer);
              conn.end();
              resolve({ stdout, stderr, exitCode: code });
            });
          });
        })
        .on("error", (err: Error) => {
          clearTimeout(connectTimer);
          if (commandTimer) clearTimeout(commandTimer);
          reject(new RobotConnectionError(`SSH connection failed: ${err.message}`));
        })
        .connect({ host, port, username: SSH_USERNAME, password: SSH_PASSWORD });
    });
  }

  async connect(ip: string, port: number): Promise<LicenseConfig> {
    if (this.session) {
      this.log.warn(
        { previousIp: this.session.robotIp, newIp: ip },
        "Replacing existing robot session"
      );
    }

    this.log.info({ ip, port }, "Connecting to robot");

    const result = await this.executeSsh(ip, port, "echo ok", 10_000, 10_000);

    if (result.exitCode !== 0) {
      throw new RobotCommandError(
        `SSH validation failed (exit code ${result.exitCode}): ${result.stderr}`
      );
    }

    this.session = {
      robotIp: ip,
      robotPort: port,
      connectedAt: Date.now(),
    };

    this.log.info({ ip, port }, "Connected to robot, reading config");
    return this.readConfig();
  }

  async disconnect(): Promise<void> {
    if (this.session) {
      this.log.info(
        { ip: this.session.robotIp, port: this.session.robotPort },
        "Disconnecting robot session"
      );
    }
    this.session = null;
  }

  async getSession(): Promise<LicenseTestSession | null> {
    return this.session;
  }

  async readConfig(): Promise<LicenseConfig> {
    const session = this.requireSession();
    const results: Record<string, string> = {};

    for (const key of LICENSE_KEYS) {
      const command = readKeyCommand(key);
      const result = await this.executeSsh(
        session.robotIp,
        session.robotPort,
        command,
        10_000,
        30_000
      );

      if (result.exitCode !== 0) {
        throw new RobotCommandError(
          `Failed to read key '${key}' (exit code ${result.exitCode}): ${result.stderr}`
        );
      }

      results[key] = parseQueryOutput(result.stdout);
    }

    const config: LicenseConfig = {
      [LICENSE_KEY_LICENSES]: results[LICENSE_KEY_LICENSES] || "",
      [LICENSE_KEY_TYPE]: (VALID_LICENSE_TYPES.includes(results[LICENSE_KEY_TYPE] as any)
        ? results[LICENSE_KEY_TYPE]
        : "None") as LicenseConfig[typeof LICENSE_KEY_TYPE],
      [LICENSE_KEY_AUTH_START]: results[LICENSE_KEY_AUTH_START] || "",
    };

    this.log.info({ config }, "License config read from robot");
    return config;
  }

  async applyConfig(config: LicenseConfig): Promise<void> {
    const session = this.requireSession();

    this.log.info({ config }, "Applying license config to robot");

    for (const key of LICENSE_KEYS) {
      const value = config[key];
      if (value === undefined || value === null) {
        throw new InvalidArgumentError(`Missing value for key '${key}'`);
      }

      const readCmd = readKeyCommand(key);
      const readResult = await this.executeSsh(
        session.robotIp,
        session.robotPort,
        readCmd,
        10_000,
        30_000
      );

      if (readResult.exitCode !== 0) {
        throw new RobotCommandError(
          `Failed to query key '${key}' (exit code ${readResult.exitCode}): ${readResult.stderr}`
        );
      }

      const existingValue = parseQueryOutput(readResult.stdout);
      const hasExisting = readResult.stdout.includes("Row:");

      const command = hasExisting
        ? updateKeyCommand(key, value)
        : insertKeyCommand(key, value);

      const result = await this.executeSsh(
        session.robotIp,
        session.robotPort,
        command,
        10_000,
        30_000
      );

      if (result.exitCode !== 0) {
        throw new RobotCommandError(
          `Failed to ${hasExisting ? "update" : "insert"} key '${key}' (exit code ${result.exitCode}): ${result.stderr}`
        );
      }

      this.log.info({ key, value, operation: hasExisting ? "update" : "insert" }, "Key applied");
    }
  }
}

export class NoSessionError extends Error {
  constructor() {
    super("No active robot session. Connect to a robot first.");
    this.name = "NoSessionError";
  }
}

export class InvalidArgumentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidArgumentError";
  }
}

export class RobotConnectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RobotConnectionError";
  }
}

export class RobotCommandError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RobotCommandError";
  }
}

export class RobotTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RobotTimeoutError";
  }
}
