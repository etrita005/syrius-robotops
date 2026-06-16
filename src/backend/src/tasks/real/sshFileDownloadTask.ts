import type { ValueMap } from "flowed";
import { Client, type SFTPWrapper } from "ssh2";
import { mkdir } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { createHash } from "node:crypto";
import { posix as pathPosix } from "node:path";
import { join as pathJoin } from "node:path";
import { BaseTask } from "../baseTask.js";
import type { Logger } from "../../logger/index.js";
import { SSH_USERNAME, SSH_PASSWORD } from "../../config.js";

export interface SshFileDownloadParams {
  robotIp: string;
  robotPort?: number;
  robotMdnsDomain?: string;
  timeout?: number;
  retryCount?: number;
  sshUsername: string;
  sshPassword: string;
  remoteFilePath: string;
  localTargetDir: string;
  verifyChecksum?: boolean;
  checksumAlgorithm?: "sha256" | "md5";
}

export interface SshFileDownloadResult {
  done: boolean;
  success: boolean;
  bytesTransferred: number;
  localFilePath: string;
  localChecksum: string;
  remoteChecksum: string;
  integrityVerified: boolean;
}

function resolveHost(params: SshFileDownloadParams): string {
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

function statRemoteFile(
  conn: Client,
  remotePath: string
): Promise<{ size: number }> {
  return new Promise((resolve, reject) => {
    conn.sftp((err: Error | undefined, sftp: SFTPWrapper) => {
      if (err) {
        reject(err);
        return;
      }
      sftp.stat(remotePath, (statErr: Error | undefined, stats: { size: number }) => {
        if (statErr) {
          reject(new Error(`Remote file not found or inaccessible: ${remotePath} — ${statErr.message}`));
          return;
        }
        resolve({ size: stats.size });
      });
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

        const hashMatch = stdout.trim().split(/\s+/)[0];
        if (!hashMatch) {
          reject(
            new Error(`Failed to parse remote checksum output: ${stdout.trim()}`)
          );
          return;
        }

        resolve(hashMatch);
      });
    });
  });
}

function downloadFile(
  conn: Client,
  remotePath: string,
  localPath: string,
  log: Logger
): Promise<number> {
  return new Promise((resolve, reject) => {
    conn.sftp((err: Error | undefined, sftp: SFTPWrapper) => {
      if (err) {
        reject(err);
        return;
      }

      let bytesTransferred = 0;
      let lastProgressLog = 0;

      sftp.fastGet(
        remotePath,
        localPath,
        {
          step: (totalTransferred: number, _chunk: number, fileSize: number) => {
            bytesTransferred = totalTransferred;
            const now = Date.now();
            if (now - lastProgressLog > 2000) {
              const percent = fileSize > 0 ? ((totalTransferred / fileSize) * 100).toFixed(1) : "?";
              log.info({ totalTransferred, fileSize, percent }, 'Download progress');
              lastProgressLog = now;
            }
          },
        },
        (sftpErr: Error | null | undefined) => {
          if (sftpErr) {
            reject(sftpErr);
            return;
          }
          log.info({ bytesTransferred }, 'Download completed');
          resolve(bytesTransferred);
        }
      );
    });
  });
}

export class SshFileDownloadTask extends BaseTask {
  public buildParams(params: ValueMap): SshFileDownloadParams {
    return {
      robotIp: params.robotIp as string,
      robotPort: (params.robotPort as number) ?? 22,
      robotMdnsDomain: params.robotMdnsDomain as string | undefined,
      timeout: (params.timeout as number) ?? 30000,
      retryCount: (params.retryCount as number) ?? 3,
      sshUsername: (params.sshUsername as string) ?? SSH_USERNAME,
      sshPassword: (params.sshPassword as string) ?? SSH_PASSWORD,
      remoteFilePath: params.remoteFilePath as string,
      localTargetDir: params.localTargetDir as string,
      verifyChecksum: (params.verifyChecksum as boolean) ?? true,
      checksumAlgorithm: (params.checksumAlgorithm as "sha256" | "md5") ?? "sha256",
    };
  }

  protected override async onExec(params: ValueMap, _context?: ValueMap): Promise<ValueMap> {
    const log = this.log;
    const downloadParams = this.buildParams(params);
    const host = resolveHost(downloadParams);
    const port = downloadParams.robotPort!;
    const maxRetries = downloadParams.retryCount!;
    const timeout = downloadParams.timeout!;
    const algorithm = downloadParams.checksumAlgorithm!;
    const remotePath = downloadParams.remoteFilePath;
    const fileName = pathPosix.basename(remotePath);
    const localFilePath = pathJoin(downloadParams.localTargetDir, fileName);

    await mkdir(downloadParams.localTargetDir, { recursive: true });
    log.info({ localTargetDir: downloadParams.localTargetDir }, 'Local target directory ensured');

    log.info({ remoteFilePath: remotePath }, 'Remote file path');

    let lastError: Error | undefined;
    let bytesTransferred = 0;
    let remoteChecksum = "";

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      let conn: Client | undefined;

      try {
        conn = await connectSsh(
          host,
          port,
          downloadParams.sshUsername,
          downloadParams.sshPassword,
          timeout
        );

        log.info({ remotePath }, 'Verifying remote file');
        const remoteStat = await statRemoteFile(conn, remotePath);
        log.info({ remotePath, remoteFileSize: remoteStat.size }, 'Remote file verified');

        if (downloadParams.verifyChecksum !== false) {
          log.info({ remotePath, algorithm }, 'Computing remote checksum');
          remoteChecksum = await execRemoteChecksum(
            conn,
            remotePath,
            algorithm,
            timeout
          );
          log.info({ remoteChecksum, algorithm }, 'Remote checksum computed');
        }

        log.info({ remotePath, localFilePath }, 'Downloading');

        bytesTransferred = await downloadFile(
          conn,
          remotePath,
          localFilePath,
          log
        );

        let localChecksum = "";
        let integrityVerified = false;

        if (downloadParams.verifyChecksum !== false) {
          log.info({ localFilePath, algorithm }, 'Computing local checksum');
          localChecksum = await computeLocalChecksum(localFilePath, algorithm);
          log.info({ localChecksum }, 'Local checksum computed');

          if (localChecksum !== remoteChecksum) {
            conn.end();
            throw new Error(
              `File integrity check failed: local=${localChecksum}, remote=${remoteChecksum}`
            );
          }

          integrityVerified = true;
          log.info({ localChecksum }, 'Integrity check passed');
        }

        conn.end();

        const result: SshFileDownloadResult = {
          done: true,
          success: true,
          bytesTransferred,
          localFilePath,
          localChecksum,
          remoteChecksum,
          integrityVerified,
        };

        return result as unknown as ValueMap;
      } catch (err) {
        conn?.end();
        lastError = err instanceof Error ? err : new Error(String(err));
        log.error({ attempt, maxRetries, err: lastError.message }, 'Download attempt failed');
        if (attempt < maxRetries) {
          await sleep(1000 * attempt);
        }
      }
    }

    throw lastError ?? new Error("SSH file download failed after retries");
  }
}
