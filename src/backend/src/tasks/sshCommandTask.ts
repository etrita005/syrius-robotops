import type { ValueMap, ITaskResolver } from "flowed";
import { Client } from "ssh2";
import { createLogger } from "../logger/index.js";

const log = createLogger("SshCommand");

export interface SshCommandParams {
  robotIp: string;
  robotPort?: number;
  robotMdnsDomain?: string;
  timeout?: number;
  retryCount?: number;
  sshUsername: string;
  sshPassword: string;
  sshCommand: string;
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
  timeout: number
): Promise<SshCommandResult> {
  return new Promise((resolve, reject) => {
    const conn = new Client();

    const timer = setTimeout(() => {
      conn.end();
      reject(new Error(`SSH command timed out after ${timeout}ms`));
    }, timeout);

    conn
      .on("ready", () => {
        conn.exec(command, (err, stream) => {
          if (err) {
            clearTimeout(timer);
            conn.end();
            reject(err);
            return;
          }

          let stdout = "";
          let stderr = "";

          stream.on("data", (data: Buffer) => {
            stdout += data.toString("utf-8");
          });

          stream.stderr.on("data", (data: Buffer) => {
            stderr += data.toString("utf-8");
          });

          stream.on("close", (code: number | null) => {
            clearTimeout(timer);
            conn.end();
            resolve({ stdout, stderr, exitCode: code });
          });
        });
      })
      .on("error", (err: Error) => {
        clearTimeout(timer);
        reject(err);
      })
      .connect({ host, port, username, password });
  });
}

export class SshCommandTask implements ITaskResolver {
  protected getSshCommand(_params: ValueMap): string {
    return _params.sshCommand as string;
  }

  /**
   * Wrap a shell command so any inner `sudo` invocations read the password
   * from stdin instead of a TTY. The password is fed via a here-string and
   * sudo is invoked with `-S` (read from stdin) and `-p ''` (empty prompt).
   *
   * The given `command` should already contain `sudo -S` (or `sudo -S -p ''`)
   * where elevated privileges are required. Example:
   *   wrapWithSudoPassword("sudo -S -p '' /opt/install.sh", "secret")
   *
   * Special shell characters in the password are safely escaped for use
   * inside a single-quoted string.
   */
  protected wrapWithSudoPassword(command: string, password: string): string {
    const escaped = password.replace(/'/g, "'\\''");
    return `echo '${escaped}' | ${command}`;
  }

  protected buildParams(params: ValueMap): SshCommandParams {
    return {
      robotIp: params.robotIp as string,
      robotPort: (params.robotPort as number) ?? 22,
      robotMdnsDomain: params.robotMdnsDomain as string | undefined,
      timeout: (params.timeout as number) ?? 10000,
      retryCount: (params.retryCount as number) ?? 3,
      sshUsername: params.sshUsername as string,
      sshPassword: params.sshPassword as string,
      sshCommand: this.getSshCommand(params),
    };
  }

  async exec(params: ValueMap): Promise<ValueMap> {
    const sshParams = this.buildParams(params);
    const host = resolveHost(sshParams);
    const port = sshParams.robotPort!;
    const maxRetries = sshParams.retryCount!;
    const timeout = sshParams.timeout!;
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
          timeout
        );

        if (result.exitCode !== 0) {
          throw new Error(
            `SSH command exited with code ${result.exitCode}: ${result.stderr}`
          );
        }

        log.info({ host, port }, 'Command succeeded');
        return {
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
