import { statSync, readdirSync, openSync, readSync as fsReadSync, closeSync } from "node:fs";
import { join } from "node:path";
import type {
  LogFileInfo,
  LogEntry,
  LogLevel,
} from "../types/systemLog.js";
import {
  LEVEL_MAP,
  RESERVED_PINO_FIELDS,
  SAFE_FILE_NAME_RE,
} from "../types/systemLog.js";
import { AppError } from "../errors/appErrors.js";

export function assertSafeLogFileName(name: string): void {
  if (!SAFE_FILE_NAME_RE.test(name)) {
    throw new AppError(
      "INVALID_LOG_FILE_NAME",
      `Invalid log file name: ${name}`,
      400,
    );
  }
}

export function resolveLogFilePath(logsDir: string, name: string): string {
  assertSafeLogFileName(name);
  const resolved = join(logsDir, name);
  const resolvedDir = join(logsDir);
  if (!resolved.startsWith(resolvedDir + "/") && resolved !== resolvedDir) {
    throw new AppError(
      "INVALID_LOG_FILE_NAME",
      `Path escape attempt: ${name}`,
      400,
    );
  }
  return resolved;
}

function closestLevel(num: number): LogLevel {
  const levels = Object.keys(LEVEL_MAP)
    .map(Number)
    .sort((a, b) => a - b);
  let best = levels[levels.length - 1];
  for (const lvl of levels) {
    if (num <= lvl) {
      best = lvl;
      break;
    }
    best = lvl;
  }
  return LEVEL_MAP[best] ?? "info";
}

export function parsePinoLine(
  line: string,
): LogEntry | { parseError: true; raw: string } {
  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(line.trim());
  } catch {
    return { parseError: true, raw: line };
  }
  if (typeof obj !== "object" || obj === null) {
    return { parseError: true, raw: line };
  }

  const time =
    typeof obj.time === "number"
      ? new Date(obj.time).toISOString()
      : typeof obj.time === "string"
        ? obj.time
        : "";
  const levelNum = typeof obj.level === "number" ? obj.level : 30;
  const level = LEVEL_MAP[levelNum] ?? closestLevel(levelNum);
  const module =
    typeof obj.module === "string" && obj.module.length > 0
      ? obj.module
      : typeof obj.name === "string" && obj.name.length > 0 && obj.name !== "robotops"
        ? obj.name
        : undefined;
  const msg =
    typeof obj.msg === "string"
      ? obj.msg
      : obj.msg !== undefined
        ? JSON.stringify(obj.msg)
        : "";
  const extra: Record<string, unknown> = {};
  for (const k of Object.keys(obj)) {
    if (!RESERVED_PINO_FIELDS.has(k)) {
      extra[k] = obj[k];
    }
  }
  if (!LEVEL_MAP[levelNum] && typeof obj.level === "number") {
    extra.levelRaw = obj.level;
  }

  return { time, level, module, msg, extra };
}

export interface PeekResult {
  firstTs?: string;
  lastTs?: string;
}

export function peekTimestamps(filePath: string): PeekResult {
  const stat = statSync(filePath);
  if (stat.size === 0) return {};

  const PEEK = 64 * 1024;

  let firstTs: string | undefined;
  let lastTs: string | undefined;

  try {
    // peek first
    const readSize = Math.min(PEEK, stat.size);
    const buf = Buffer.alloc(readSize);
    const fd = openSync(filePath, "r");
    try {
      fsReadSync(fd, buf, 0, readSize, 0);
    } finally {
      closeSync(fd);
    }
    const head = buf.toString("utf8");
    const firstLine = head.split("\n", 1)[0];
    if (firstLine) {
      const item = parsePinoLine(firstLine);
      if (!("parseError" in item)) {
        firstTs = item.time;
      }
    }
  } catch {
    // ignore
  }

  try {
    // peek last
    const readSize = Math.min(PEEK, stat.size);
    if (readSize > 0) {
      const buf = Buffer.alloc(readSize);
      const fd = openSync(filePath, "r");
      try {
        fsReadSync(fd, buf, 0, readSize, stat.size - readSize);
      } finally {
        closeSync(fd);
      }
      const tail = buf.toString("utf8");
      const lines = tail.split("\n").filter((l) => l.trim());
      if (lines.length > 0) {
        const item = parsePinoLine(lines[lines.length - 1]);
        if (!("parseError" in item)) {
          lastTs = item.time;
        }
      }
    }
  } catch {
    // ignore
  }

  return { firstTs, lastTs };
}

export function listLogFiles(logsDir: string): LogFileInfo[] {
  let entries: import("node:fs").Dirent[];
  try {
    entries = readdirSync(logsDir, { withFileTypes: true });
  } catch {
    return [];
  }

  const files: LogFileInfo[] = [];

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!SAFE_FILE_NAME_RE.test(entry.name)) continue;
    const fullPath = join(logsDir, entry.name);
    let fileStat;
    try {
      fileStat = statSync(fullPath);
    } catch {
      continue;
    }
    const timestamps = peekTimestamps(fullPath);
    files.push({
      name: entry.name,
      size: fileStat.size,
      mtime: fileStat.mtime.toISOString(),
      firstTs: timestamps.firstTs,
      lastTs: timestamps.lastTs,
      isActive: false,
    });
  }

  files.sort((a, b) => {
    const aMatch = a.name.match(/\d+/);
    const bMatch = b.name.match(/\d+/);
    const aNum = aMatch ? parseInt(aMatch[0], 10) : Infinity;
    const bNum = bMatch ? parseInt(bMatch[0], 10) : Infinity;
    return aNum - bNum;
  });

  if (files.length > 0) {
    files[files.length - 1].isActive = true;
  }

  return files;
}

export interface CursorData {
  f: string;
  o: number;
}

export function encodeCursor(cursor: CursorData): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

export function decodeCursor(raw: string): CursorData | null {
  try {
    const json = Buffer.from(raw, "base64url").toString("utf8");
    const data = JSON.parse(json);
    if (typeof data.f !== "string" || typeof data.o !== "number") return null;
    return data as CursorData;
  } catch {
    return null;
  }
}
