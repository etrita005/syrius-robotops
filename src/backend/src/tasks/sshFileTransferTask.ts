import type { ValueMap, ITaskResolver } from "flowed";
import { Client, type SFTPWrapper } from "ssh2";
import { stat } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { createHash } from "node:crypto";
import { posix as pathPosix } from "node:path";
import { createLogger } from "../logger/index.js";

const log = createLogger("SshFileTransfer");

export interface SshFileTransferParams {
  // --- Connection ---
  robotIp: string;
  robotPort?: number;
  robotMdnsDomain?: string;
  timeout?: number;
  retryCount?: number;
  sshUsername: string;
  sshPassword: string;

  // --- Transfer ---
  localFilePath: string;
  remoteFilePath: string;

  // --- Verification ---
  verifyChecksum?: boolean;
  checksumAlgorithm?: "sha256" | "md5";
}

export interface SshFileTransferResult {
  success: boolean;
  bytesTransferred: number;
  localChecksum: string;
  remoteChecksum: string;
  integrityVerified: boolean;
}

function resolveHost(params: SshFileTransferParams): string {
  return params.robotMdnsDomain ?? params.robotIp;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function computeLocalChecksum(
  filePath: string,
  algorithm: "sha256" | "md5"
): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash(algorithm);
    const stream = createReadStream(filePath, { highWaterMark: 64 * 1024 });

    stream.on("data", (chunk: Buffer) => {
      hash.update(chunk);
    });

    stream.on("end", () => {
      resolve(hash.digest("hex"));
    });

    stream.on("error", (err: Error) => {
      reject(err);
    });
  });
}

function connectSsh(
  host: string,
  port: number,
  username: string,
  password: string,
  timeout: number
): Promise<Client> {
  return new Promise((resolve, reject) => {
    const conn = new Client();

    const timer = setTimeout(() => {
      conn.end();
      reject(new Error(`SSH connection timed out after ${timeout}ms`));
    }, timeout);

    conn
      .on("ready", () => {
        clearTimeout(timer);
        resolve(conn);
      })
      .on("error", (err: Error) => {
        clearTimeout(timer);
        reject(err);
      })
      .connect({ host, port, username, password, readyTimeout: timeout });
  });
}

function ensureRemoteParentDir(
  conn: Client,
  remotePath: string,
  timeout: number
): Promise<void> {
  const parentDir = pathPosix.dirname(remotePath);
  if (!parentDir || parentDir === "." || parentDir === "/") {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const command = `mkdir -p "${parentDir}"`;

    const timer = setTimeout(() => {
      reject(new Error(`Remote mkdir command timed out after ${timeout}ms`));
    }, timeout);

    conn.exec(command, (err, stream) => {
      if (err) {
        clearTimeout(timer);
        reject(err);
        return;
      }

      let stderr = "";

      stream.stderr.on("data", (data: Buffer) => {
        stderr += data.toString("utf-8");
      });

      stream.on("close", (code: number | null) => {
        clearTimeout(timer);
        if (code !== 0) {
          reject(
            new Error(
              `Remote mkdir -p failed (exit code ${code}) for "${parentDir}": ${stderr.trim()}`
            )
          );
          return;
        }
        log.info({ parentDir }, 'Ensured remote directory');
        resolve();
      });
    });
  });
}

function transferFile(
  conn: Client,
  localPath: string,
  remotePath: string
): Promise<number> {  return new Promise((resolve, reject) => {
    conn.sftp((err: Error | undefined, sftp: SFTPWrapper) => {
      if (err) {
        reject(err);
        return;
      }

      let bytesTransferred = 0;
      let lastProgressLog = 0;

      sftp.fastPut(
        localPath,
        remotePath,
        {
          step: (totalTransferred: number, _chunk: number, fileSize: number) => {
            bytesTransferred = totalTransferred;
            const now = Date.now();
            // Log progress every 2 seconds
            if (now - lastProgressLog > 2000) {
              const percent = fileSize > 0 ? ((totalTransferred / fileSize) * 100).toFixed(1) : "?";
              log.info({ totalTransferred, fileSize, percent }, 'Transfer progress');
              lastProgressLog = now;
            }
          },
        },
        (sftpErr: Error | null | undefined) => {
          if (sftpErr) {
            reject(sftpErr);
            return;
          }
          log.info({ bytesTransferred }, 'Transfer completed');
          resolve(bytesTransferred);
        }
      );
    });
  });
}

function execRemoteChecksum(
  conn: Client,
  remotePath: string,
  algorithm: "sha256" | "md5",
  timeout: number
): Promise<string> {
  return new Promise((resolve, reject) => {
    const command =
      algorithm === "md5"
        ? `md5sum "${remotePath}"`
        : `sha256sum "${remotePath}"`;

    const timer = setTimeout(() => {
      reject(new Error(`Remote checksum command timed out after ${timeout}ms`));
    }, timeout);

    conn.exec(command, (err, stream) => {
      if (err) {
        clearTimeout(timer);
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
        if (code !== 0) {
          reject(
            new Error(
              `Remote checksum command failed (exit code ${code}): ${stderr.trim()}`
            )
          );
          return;
        }

        // sha256sum / md5sum output format: "<hash>  <filename>"
        const hashMatch = stdout.trim().split(/\s+/)[0];
        if (!hashMatch) {
          reject(
            new Error(`Failed to parse remote checksum output: ${stdout.trim()}`
            )
          );
          return;
        }

        resolve(hashMatch);
      });
    });
  });
}

export class SshFileTransferTask implements ITaskResolver {
  protected buildParams(params: ValueMap): SshFileTransferParams {
    return {
      robotIp: params.robotIp as string,
      robotPort: (params.robotPort as number) ?? 22,
      robotMdnsDomain: params.robotMdnsDomain as string | undefined,
      timeout: (params.timeout as number) ?? 30000,
      retryCount: (params.retryCount as number) ?? 3,
      sshUsername: params.sshUsername as string,
      sshPassword: params.sshPassword as string,
      localFilePath: params.localFilePath as string,
      remoteFilePath: params.remoteFilePath as string,
      verifyChecksum: (params.verifyChecksum as boolean) ?? true,
      checksumAlgorithm: (params.checksumAlgorithm as "sha256" | "md5") ?? "sha256",
    };
  }

  async exec(params: ValueMap): Promise<ValueMap> {
    const transferParams = this.buildParams(params);
    const host = resolveHost(transferParams);
    const port = transferParams.robotPort!;
    const maxRetries = transferParams.retryCount!;
    const timeout = transferParams.timeout!;
    const algorithm = transferParams.checksumAlgorithm!;

    // Verify local file exists before attempting transfer
    let localFileSize: number;
    try {
      const statResult = await stat(transferParams.localFilePath);
      localFileSize = statResult.size;
    } catch {
      throw new Error(
        `Local file not found or inaccessible: ${transferParams.localFilePath}`
      );
    }

    log.info({ localFilePath: transferParams.localFilePath, localFileSize }, 'Local file');

    let localChecksum = "";
    if (transferParams.verifyChecksum !== false) {
      log.info({ localFilePath: transferParams.localFilePath, algorithm }, 'Computing local checksum');
      localChecksum = await computeLocalChecksum(
        transferParams.localFilePath,
        algorithm
      );
      log.info({ localChecksum, algorithm }, 'Local checksum computed');
    }

    log.info({ host, port, username: transferParams.sshUsername }, 'Connecting');

    let lastError: Error | undefined;
    let bytesTransferred = 0;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      let conn: Client | undefined;

      try {
        conn = await connectSsh(
          host,
          port,
          transferParams.sshUsername,
          transferParams.sshPassword,
          timeout
        );

        log.info({ remoteFilePath: transferParams.remoteFilePath }, 'Ensuring remote parent directory');

        await ensureRemoteParentDir(
          conn,
          transferParams.remoteFilePath,
          timeout
        );

        log.info({ localFilePath: transferParams.localFilePath, remoteFilePath: transferParams.remoteFilePath }, 'Transferring');

        bytesTransferred = await transferFile(
          conn,
          transferParams.localFilePath,
          transferParams.remoteFilePath
        );

        if (transferParams.verifyChecksum !== false) {
          log.info({ algorithm }, 'Verifying remote checksum');

          const remoteChecksum = await execRemoteChecksum(
            conn,
            transferParams.remoteFilePath,
            algorithm,
            timeout
          );

          log.info({ remoteChecksum }, 'Remote checksum');

          if (localChecksum !== remoteChecksum) {
            conn.end();
            throw new Error(
              `File integrity check failed: local=${localChecksum}, remote=${remoteChecksum}`
            );
          }

          log.info({ localChecksum }, 'Integrity check passed');
        }

        conn.end();

        const result: SshFileTransferResult = {
          success: true,
          bytesTransferred,
          localChecksum,
          remoteChecksum: transferParams.verifyChecksum !== false ? localChecksum : "",
          integrityVerified: transferParams.verifyChecksum !== false,
        };

        return result as unknown as ValueMap;
      } catch (err) {
        conn?.end();
        lastError = err instanceof Error ? err : new Error(String(err));
        log.error({ attempt, maxRetries, err: lastError.message }, 'Transfer attempt failed');
        if (attempt < maxRetries) {
          await sleep(1000 * attempt);
        }
      }
    }

    throw lastError ?? new Error("SSH file transfer failed after retries");
  }
}
