import { stat, readFile } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { createHash } from "node:crypto";

export class ChecksumService {
  async computeSha256(
    filePath: string,
    options?: {
      onProgress?: (bytesProcessed: number, totalBytes: number) => void;
      abortSignal?: AbortSignal;
    }
  ): Promise<string> {
    const s = await stat(filePath);
    const totalBytes = s.size;

    return new Promise((resolve, reject) => {
      const hash = createHash("sha256");
      let bytesProcessed = 0;
      const stream = createReadStream(filePath, { highWaterMark: 64 * 1024 });

      const onAbort = () => {
        stream.destroy();
        reject(new Error("Checksum computation cancelled"));
      };

      if (options?.abortSignal) {
        options.abortSignal.addEventListener("abort", onAbort, { once: true });
      }

      stream.on("data", (chunk: Buffer) => {
        hash.update(chunk);
        bytesProcessed += chunk.length;
        options?.onProgress?.(bytesProcessed, totalBytes);
      });

      stream.on("end", () => {
        if (options?.abortSignal) {
          options.abortSignal.removeEventListener("abort", onAbort);
        }
        resolve(hash.digest("hex"));
      });

      stream.on("error", (err) => {
        if (options?.abortSignal) {
          options.abortSignal.removeEventListener("abort", onAbort);
        }
        reject(err);
      });
    });
  }
}
