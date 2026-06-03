import type { ValueMap, ITaskResolver } from "flowed";
import { Client } from "ssh2";

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

    console.log(`[SSH] Connecting to ${sshParams.sshUsername}@${host}:${port}`);

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

        console.log(`[SSH] Command succeeded on ${host}:${port}`);
        return {
          success: true,
          stdout: result.stdout,
          stderr: result.stderr,
          exitCode: result.exitCode,
        };
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        console.error(`[SSH] Attempt ${attempt}/${maxRetries} to ${host}:${port} failed: ${lastError.message}`);
        if (attempt < maxRetries) {
          await sleep(1000 * attempt);
        }
      }
    }

    throw lastError ?? new Error("SSH command failed after retries");
  }
}
