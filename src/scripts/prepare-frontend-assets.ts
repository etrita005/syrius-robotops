import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, rm, stat, writeFile, copyFile } from "node:fs/promises";
import { dirname, extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

interface AssetManifestEntry {
  path: string;
  size: number;
  sha256: string;
  contentType: string;
  cacheControl: string;
}

interface AssetManifest {
  generatedAt: string;
  files: AssetManifestEntry[];
}

const scriptDir = dirname(fileURLToPath(import.meta.url));
const srcRoot = join(scriptDir, "..");
const frontendDist = join(srcRoot, "frontend", "dist");
const backendStatic = join(srcRoot, "backend", "dist-static");

const contentTypes: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".map": "application/json; charset=utf-8",
};

function toPosixPath(pathValue: string): string {
  return pathValue.split("\\").join("/");
}

function getContentType(filePath: string): string {
  return contentTypes[extname(filePath).toLowerCase()] ?? "application/octet-stream";
}

function getCacheControl(assetPath: string): string {
  if (assetPath === "index.html" || assetPath.endsWith(".json")) {
    return "no-cache";
  }
  return "public, max-age=31536000, immutable";
}

async function listFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      return listFiles(fullPath);
    }
    if (entry.isFile()) {
      return [fullPath];
    }
    return [];
  }));
  return files.flat();
}

async function copyRecursiveFile(source: string, destination: string): Promise<void> {
  await mkdir(dirname(destination), { recursive: true });
  await copyFile(source, destination);
}

async function main(): Promise<void> {
  await stat(join(frontendDist, "index.html"));
  await rm(backendStatic, { recursive: true, force: true });
  await mkdir(backendStatic, { recursive: true });

  const files = await listFiles(frontendDist);
  const manifestFiles: AssetManifestEntry[] = [];

  for (const sourcePath of files) {
    const relPath = toPosixPath(relative(frontendDist, sourcePath));
    const destinationPath = join(backendStatic, relPath);
    const data = await readFile(sourcePath);
    await copyRecursiveFile(sourcePath, destinationPath);
    manifestFiles.push({
      path: relPath,
      size: data.byteLength,
      sha256: createHash("sha256").update(data).digest("hex"),
      contentType: getContentType(relPath),
      cacheControl: getCacheControl(relPath),
    });
  }

  const manifest: AssetManifest = {
    generatedAt: new Date().toISOString(),
    files: manifestFiles.sort((a, b) => a.path.localeCompare(b.path)),
  };

  await writeFile(
    join(backendStatic, "asset-manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8"
  );
}

await main();
