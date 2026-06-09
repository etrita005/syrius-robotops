import { readFile } from "node:fs/promises";
import { join, posix } from "node:path";

export interface StaticAssetInfo {
  path: string;
  size: number;
  sha256: string;
  contentType: string;
  cacheControl: string;
}

interface AssetManifest {
  generatedAt: string;
  files: StaticAssetInfo[];
}

export class StaticAssetService {
  private readonly assets = new Map<string, StaticAssetInfo>();

  private constructor(private readonly staticRoot: string) {}

  static async create(staticRoot: string): Promise<StaticAssetService> {
    const service = new StaticAssetService(staticRoot);
    const manifestRaw = await readFile(join(staticRoot, "asset-manifest.json"), "utf8");
    const manifest = JSON.parse(manifestRaw) as AssetManifest;
    for (const file of manifest.files) {
      service.assets.set(file.path, file);
    }
    if (!service.assets.has("index.html")) {
      throw new Error("Static asset index missing");
    }
    return service;
  }

  normalizeRequestPath(requestPath: string): string | null {
    const withoutQuery = requestPath.split("?")[0] ?? requestPath;
    const decoded = decodeURIComponent(withoutQuery);
    const trimmed = decoded.replace(/^\/+/, "");
    const normalized = posix.normalize(trimmed || "index.html");
    if (normalized === ".." || normalized.startsWith("../") || posix.isAbsolute(normalized)) {
      return null;
    }
    return normalized;
  }

  hasAsset(assetPath: string): boolean {
    return this.assets.has(assetPath);
  }

  getAssetInfo(assetPath: string): StaticAssetInfo | null {
    return this.assets.get(assetPath) ?? null;
  }

  async readAsset(assetPath: string): Promise<Buffer> {
    return readFile(join(this.staticRoot, assetPath));
  }

  async readIndexHtml(): Promise<Buffer> {
    return this.readAsset("index.html");
  }
}
