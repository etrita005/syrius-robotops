import { createLogger } from "../logger/index.js";

const log = createLogger("Retry");

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: { maxRetries?: number; baseMs?: number; maxMs?: number } = {}
): Promise<T> {
  const { maxRetries = 3, baseMs = 200, maxMs = 5000 } = options;
  let lastErr: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt === maxRetries) break;
      const delay = Math.min(baseMs * 2 ** attempt, maxMs);
      log.warn({ attempt: attempt + 1, maxRetries, delayMs: delay }, "Retrying after failure");
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}
