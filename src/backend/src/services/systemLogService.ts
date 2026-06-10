import { openSync, readSync, closeSync, statSync, createReadStream } from "node:fs";
import { join } from "node:path";
import archiver from "archiver";
import { createLogger } from "../logger/index.js";
import type {
  LogFileInfo,
  LogEntry,
  LogQueryRequest,
  LogQueryResponse,
  LogBundleRequest,
  LogBundleManifest,
} from "../types/systemLog.js";
import { KNOWN_MODULES } from "../types/systemLog.js";
import {
  parsePinoLine,
  listLogFiles,
  encodeCursor,
  decodeCursor,
  assertSafeLogFileName,
  resolveLogFilePath,
} from "./systemLogHelpers.js";

const log = createLogger("SystemLogService");

const NONE_MODULE = "(none)";

export interface SystemLogServiceOptions {
  logsDir: string;
  defaultWindowMs?: number;
  defaultLimit?: number;
  maxLimit?: number;
  studioVersion: string;
}

export class SystemLogService {
  private logsDir: string;
  private defaultWindowMs: number;
  private defaultLimit: number;
  private maxLimit: number;
  private studioVersion: string;
  private moduleCache: { modules: string[]; cachedAt: number } | null = null;

  constructor(options: SystemLogServiceOptions) {
    this.logsDir = options.logsDir;
    this.defaultWindowMs = options.defaultWindowMs ?? 30 * 60 * 1000;
    this.defaultLimit = options.defaultLimit ?? 500;
    this.maxLimit = options.maxLimit ?? 1000;
    this.studioVersion = options.studioVersion;
    log.info({
      logsDir: this.logsDir,
      defaultWindowMs: this.defaultWindowMs,
      defaultLimit: this.defaultLimit,
      maxLimit: this.maxLimit,
    }, "SystemLog service initialized");
  }

  async listFiles(): Promise<LogFileInfo[]> {
    return listLogFiles(this.logsDir);
  }

  async listModules(): Promise<string[]> {
    const now = Date.now();
    if (this.moduleCache && now - this.moduleCache.cachedAt < 30_000) {
      return this.moduleCache.modules;
    }

    const discovered = new Set<string>();
    const files = listLogFiles(this.logsDir);
    const sampleFiles = files.slice(-2);

    for (const f of sampleFiles) {
      const fullPath = join(this.logsDir, f.name);
      try {
        const stat = statSync(fullPath);
        const SAMPLE = 64 * 1024;
        const readSize = Math.min(SAMPLE, stat.size);
        if (readSize <= 0) continue;
        const buf = Buffer.alloc(readSize);
        const fd = openSync(fullPath, "r");
        try {
          readSync(fd, buf, 0, readSize, stat.size - readSize);
        } finally {
          closeSync(fd);
        }
        const tail = buf.toString("utf8");
        const lines = tail.split("\n").filter((l) => l.trim());
        for (const line of lines) {
          const entry = parsePinoLine(line);
          if (!("parseError" in entry) && entry.module) {
            discovered.add(entry.module);
          }
        }
      } catch {
        // skip unreadable file
      }
    }

    for (const m of KNOWN_MODULES) {
      discovered.add(m);
    }

    const modules = [NONE_MODULE, ...Array.from(discovered)].sort();
    this.moduleCache = { modules, cachedAt: now };
    return modules;
  }

  async query(req: LogQueryRequest): Promise<LogQueryResponse> {
    const now = new Date().toISOString();
    let to = req.to ?? now;
    let from: string;

    const toMs = Date.parse(to);
    if (isNaN(toMs)) {
      to = now;
    }

    if (req.from) {
      from = req.from;
      const fromMs = Date.parse(from);
      if (isNaN(fromMs)) {
        from = new Date(Date.parse(to || now) - this.defaultWindowMs).toISOString();
      }
    } else {
      from = new Date((Date.parse(to) || Date.now()) - this.defaultWindowMs).toISOString();
    }

    const fromMs = Date.parse(from);
    const toMsFinal = Date.parse(to);

    if (isNaN(fromMs) || isNaN(toMsFinal) || fromMs > toMsFinal) {
      return { entries: [], truncated: false, parseErrorCount: 0 };
    }

    const order = req.order ?? "desc";
    const limit = Math.min(req.limit ?? this.defaultLimit, this.maxLimit);
    const levels = req.levels?.length ? new Set(req.levels) : null;
    const modules = req.modules?.length ? new Set(req.modules) : null;
    const q = req.q?.toLowerCase() ?? "";

    const files = listLogFiles(this.logsDir).filter((f) => {
      if (!f.firstTs && !f.lastTs) return true;
      if (f.lastTs && Date.parse(f.lastTs) < fromMs) return false;
      if (f.firstTs && Date.parse(f.firstTs) > toMsFinal) return false;
      return true;
    });

    files.sort((a, b) => {
      const aMatch = a.name.match(/\d+/);
      const bMatch = b.name.match(/\d+/);
      const aNum = aMatch ? parseInt(aMatch[0], 10) : Infinity;
      const bNum = bMatch ? parseInt(bMatch[0], 10) : Infinity;
      return bNum - aNum;
    });

    let cursor = req.cursor ? decodeCursor(req.cursor) : null;
    const entries: LogEntry[] = [];
    let parseErrorCount = 0;
    let nextCursor: string | null = null;

    outer: for (const file of files) {
      if (entries.length >= limit) break;
      const fullPath = join(this.logsDir, file.name);
      let fileStat;
      try {
        fileStat = statSync(fullPath);
      } catch {
        continue;
      }
      if (fileStat.size === 0) continue;

      const startOffset = cursor && cursor.f === file.name ? cursor.o : fileStat.size;
      const CHUNK = 64 * 1024;

      let pos = startOffset;
      let tail = "";
      let lastYieldedOffset = startOffset;

      while (pos > 0) {
        if (entries.length >= limit) break;
        const readSize = Math.min(CHUNK, pos);
        pos -= readSize;
        const buf = Buffer.alloc(readSize);
        let fd: number;
        try {
          fd = openSync(fullPath, "r");
        } catch {
          break;
        }
        try {
          readSync(fd, buf, 0, readSize, pos);
        } finally {
          closeSync(fd);
        }
        const text = buf.toString("utf8") + tail;
        const newlineIdx = text.indexOf("\n");
        const firstFragment = newlineIdx >= 0 ? text.slice(0, newlineIdx) : text;
        const remainder = newlineIdx >= 0 ? text.slice(newlineIdx + 1) : "";

        // Split remainder at the buf/tail boundary, rounded to the nearest
        // newline so bufRemainder only contains complete lines whose cursor
        // offsets can be computed correctly against buf byte positions.
        const splitAt = buf.toString("utf8").length - newlineIdx - 1;
        const splitNl = splitAt > 0 ? remainder.lastIndexOf("\n", Math.min(splitAt, remainder.length - 1)) : -1;
        const safeSplit = splitNl >= 0 ? splitNl + 1 : Math.max(0, splitAt);
        const bufRemainder = remainder.slice(0, safeSplit);

        const lines = bufRemainder.split("\n");

        // First pass: compute absolute file offsets of each line by
        // walking from the known anchor point (start of first complete
        // line in buf).  This is the only way to get correct offsets
        // when `remainder` includes both buf and tail portions.
        const lineOffsets: number[] = [];
        let cursor = pos + newlineIdx + 1;
        for (let i = 0; i < lines.length; i++) {
          lineOffsets.push(cursor);
          const lineLen = Buffer.byteLength(lines[i]) + 1; // +1 for \n
          cursor += lineLen;
        }

        // Process buf lines in reverse with precomputed correct offsets.
        for (let i = lines.length - 1; i >= 0; i--) {
          const line = lines[i];
          if (line.length === 0) continue;

          const result = parsePinoLine(line);
          if ("parseError" in result) {
            parseErrorCount++;
            continue;
          }

          const entryTime = Date.parse(result.time);
          if (!isNaN(entryTime)) {
            if (entryTime > toMsFinal) continue;
            if (entryTime < fromMs) {
              break outer;
            }
          }

          if (levels && !levels.has(result.level)) continue;
          if (modules) {
            const modKey = result.module ?? NONE_MODULE;
            if (!modules.has(modKey)) continue;
          }
          if (q && !result.msg.toLowerCase().includes(q)) continue;

          entries.push(result);
          lastYieldedOffset = lineOffsets[i];

          if (entries.length >= limit) {
            nextCursor = encodeCursor({ f: file.name, o: lastYieldedOffset });
            break outer;
          }
        }

        // Process tail portion lines (from previous chunk) for entry
        // matching but without cursor tracking (they belong to prev chunk).
        const tailRemainder = remainder.slice(safeSplit);
        if (tailRemainder.length > 0 && entries.length < limit) {
          const tailLineList = tailRemainder.split("\n");
          for (let i = tailLineList.length - 1; i >= 0; i--) {
            const line = tailLineList[i];
            if (line.length === 0) continue;
            const result = parsePinoLine(line);
            if ("parseError" in result) { parseErrorCount++; continue; }
            const entryTime = Date.parse(result.time);
            if (!isNaN(entryTime)) {
              if (entryTime > toMsFinal) continue;
              if (entryTime < fromMs) { break outer; }
            }
            if (levels && !levels.has(result.level)) continue;
            if (modules && !modules.has(result.module ?? NONE_MODULE)) continue;
            if (q && !result.msg.toLowerCase().includes(q)) continue;
            entries.push(result);
            if (entries.length >= limit) {
              nextCursor = encodeCursor({ f: file.name, o: pos });
              break outer;
            }
          }
        }
        if (nextCursor) break;

        tail = firstFragment;
      }

      // Process any remaining tail line (the earliest line in the file)
      if (entries.length < limit && tail.length > 0 && pos === 0) {
        const result = parsePinoLine(tail);
        if (!("parseError" in result)) {
          const entryTime = Date.parse(result.time);
          let include = true;
          if (!isNaN(entryTime)) {
            if (entryTime > toMsFinal) include = false;
            else if (entryTime < fromMs) include = false;
          }
          if (include && (!levels || levels.has(result.level)) && (!modules || modules.has(result.module ?? NONE_MODULE)) && (!q || result.msg.toLowerCase().includes(q))) {
            entries.push(result);
          }
        } else {
          parseErrorCount++;
        }
      }

      if (nextCursor) break;
      cursor = null;
    }

    if (order === "asc") {
      entries.reverse();
    }

    return {
      entries,
      nextCursor: nextCursor ?? undefined,
      truncated: !!nextCursor,
      parseErrorCount,
    };
  }

  async createBundleStream(req: LogBundleRequest): Promise<{
    fileName: string;
    contentType: "application/zip";
    stream: archiver.Archiver;
  }> {
    const fromMs = Date.parse(req.from);
    const toMs = Date.parse(req.to);
    if (isNaN(fromMs) || isNaN(toMs)) {
      throw new Error("INVALID_LOG_QUERY: Invalid from/to timestamps");
    }

    const files = listLogFiles(this.logsDir).filter((f) => {
      if (!f.firstTs && !f.lastTs) return true;
      if (f.lastTs && Date.parse(f.lastTs) < fromMs) return false;
      if (f.firstTs && Date.parse(f.firstTs) > toMs) return false;
      return true;
    });

    const manifest: LogBundleManifest = {
      requestedFrom: req.from,
      requestedTo: req.to,
      generatedAt: new Date().toISOString(),
      studioVersion: this.studioVersion,
      files: files.map((f) => ({
        name: f.name,
        size: f.size,
        mtime: f.mtime,
        firstTs: f.firstTs,
        lastTs: f.lastTs,
      })),
    };

    const fmt = (iso: string) =>
      iso.replace(/[-:T.Z]/g, "").slice(0, 14);
    const fileName = `robotops-logs-${fmt(req.from)}-${fmt(req.to)}.zip`;

    log.info({ from: req.from, to: req.to, fileCount: files.length }, "Bundle download");

    const archive = archiver("zip", { store: true });
    archive.append(JSON.stringify(manifest, null, 2), {
      name: "manifest.json",
    });

    for (const f of files) {
      const fullPath = join(this.logsDir, f.name);
      archive.file(fullPath, { name: f.name });
    }

    archive.finalize();

    return {
      fileName,
      contentType: "application/zip",
      stream: archive,
    };
  }

  async createFileStream(name: string): Promise<{
    contentType: "application/octet-stream";
    size: number;
    stream: ReturnType<typeof createReadStream>;
    fileName: string;
  }> {
    assertSafeLogFileName(name);
    const fullPath = resolveLogFilePath(this.logsDir, name);

    let fileStat;
    try {
      fileStat = statSync(fullPath);
    } catch {
      throw new Error("LOG_FILE_NOT_FOUND");
    }

    log.info({ name, size: fileStat.size }, "File download");

    const stream = createReadStream(fullPath, {
      end: fileStat.size - 1,
    });

    return {
      contentType: "application/octet-stream",
      size: fileStat.size,
      stream,
      fileName: name,
    };
  }
}
