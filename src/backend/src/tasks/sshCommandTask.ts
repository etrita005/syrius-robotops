import type { ValueMap, ITaskResolver } from "flowed";
import { Client } from "ssh2";
import { createLogger } from "../logger/index.js";
import { SSH_USERNAME, SSH_PASSWORD } from "../config.js";

const log = createLogger("SshCommand");

const MAX_LOG_OUTPUT_LENGTH = 4096;

function truncateForLog(s: string): string {
  if (s.length <= MAX_LOG_OUTPUT_LENGTH) return s;
  return s.slice(0, MAX_LOG_OUTPUT_LENGTH) + `... [truncated, ${s.length} total]`;
}

export interface SshCommandParams {
  robotIp: string;
  robotPort?: number;
  robotMdnsDomain?: string;
  timeout?: number;
  connectTimeout?: number;
  commandTimeout?: number;
  retryCount?: number;
  sshUsername: string;
  sshPassword: string;
  sshCommand: string;
  sudo?: boolean;
}

export interface SshCommandResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
}

function resolveHost(params: SshCommandParams): string {
  return params.robotMdnsDomain ?? params.robotIp;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function executeSshCommand(
  host: string,
  port: number,
  username: string,
  password: string,
  command: string,
  connectTimeout: number,
  commandTimeout: number
): Promise<SshCommandResult> {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    let commandTimer: ReturnType<typeof setTimeout> | undefined;

    const connectTimer = setTimeout(() => {
      conn.end();
      reject(new Error(`SSH connection timed out after ${connectTimeout}ms`));
    }, connectTimeout);

    conn
      .on("ready", () => {
        clearTimeout(connectTimer);
        conn.exec(command, (err, stream) => {
          if (err) {
            conn.end();
            reject(err);
            return;
          }

          let stdout = "";
          let stderr = "";

          commandTimer = setTimeout(() => {
            conn.end();
            reject(new Error(`SSH command timed out after ${commandTimeout}ms`));
          }, commandTimeout);

          stream.on("data", (data: Buffer) => {
            stdout += data.toString("utf-8");
          });

          stream.stderr.on("data", (data: Buffer) => {
            stderr += data.toString("utf-8");
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
        reject(err);
      })
      .connect({ host, port, username, password });
  });
}

export class SshCommandTask implements ITaskResolver {
  protected getSshCommand(_params: ValueMap): string {
    return _params.sshCommand as string;
  }

  protected buildParams(params: ValueMap): SshCommandParams {
    const sshPassword = (params.sshPassword as string) ?? SSH_PASSWORD;
    const rawCommand = this.getSshCommand(params);
    const sudo = (params.sudo as boolean) ?? false;
    const sshCommand = sudo
      ? rawCommand
          .split('&&')
          .map((p) => `echo "${sshPassword}" | sudo -S -p '' ${p.trim()}`)
          .join(' && ')
      : rawCommand;

    return {
      robotIp: params.robotIp as string,
      robotPort: (params.robotPort as number) ?? 22,
      robotMdnsDomain: params.robotMdnsDomain as string | undefined,
      timeout: (params.timeout as number) ?? 10000,
      connectTimeout: (params.connectTimeout as number) ?? (params.timeout as number) ?? 10000,
      commandTimeout: (params.commandTimeout as number) ?? (params.timeout as number) ?? 30000,
      retryCount: (params.retryCount as number) ?? 3,
      sshUsername: (params.sshUsername as string) ?? SSH_USERNAME,
      sshPassword,
      sshCommand,
      sudo,
    };
  }

  async exec(params: ValueMap): Promise<ValueMap> {
    const sshParams = this.buildParams(params);
    const host = resolveHost(sshParams);
    const port = sshParams.robotPort!;
    const maxRetries = sshParams.retryCount!;
    const connectTimeout = sshParams.connectTimeout!;
    const commandTimeout = sshParams.commandTimeout!;
    const command = sshParams.sshCommand;

    log.info({ host, port, username: sshParams.sshUsername }, 'Connecting');

    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const result = await executeSshCommand(
          host,
          port,
          sshParams.sshUsername,
          sshParams.sshPassword,
          command,
          connectTimeout,
          commandTimeout
        );

        if (result.exitCode !== 0) {
          throw new Error(
            `SSH command exited with code ${result.exitCode}: ${result.stderr}`
          );
        }

        log.info({ host, port, exitCode: result.exitCode }, 'Command succeeded');

        if (result.stdout) {
          log.debug({ host, port, stdout: truncateForLog(result.stdout) }, 'stdout');
        }
        if (result.stderr) {
          log.warn({ host, port, stderr: truncateForLog(result.stderr) }, 'stderr');
        }

        return {
          done: true,
          success: true,
          stdout: result.stdout,
          stderr: result.stderr,
          exitCode: result.exitCode,
        };
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        log.error({ host, port, attempt, maxRetries, err: lastError.message }, 'Command attempt failed');
        if (attempt < maxRetries) {
          await sleep(1000 * attempt);
        }
      }
    }

    throw lastError ?? new Error("SSH command failed after retries");
  }
}
