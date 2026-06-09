import { Hono } from "hono";
import { StaticAssetService } from "./staticAssetService.js";

const staticFileExtensionPattern = /\/[^/]+\.[^/]+$/;

function looksLikeStaticFile(pathValue: string): boolean {
  return staticFileExtensionPattern.test(pathValue);
}

function shouldReturnSpaIndex(method: string, pathValue: string): boolean {
  if (method !== "GET" && method !== "HEAD") {
    return false;
  }
  if (pathValue === "/" || pathValue === "") {
    return true;
  }
  if (pathValue.startsWith("/api/")) {
    return false;
  }
  return !looksLikeStaticFile(pathValue);
}

export function createStaticRoutes(staticAssetService: StaticAssetService): Hono {
  const app = new Hono();

  app.get("*", async (c) => {
    if (!staticAssetService.isAvailable()) {
      return c.notFound();
    }

    const normalizedPath = staticAssetService.normalizeRequestPath(c.req.path);
    if (normalizedPath && staticAssetService.hasAsset(normalizedPath)) {
      const info = staticAssetService.getAssetInfo(normalizedPath);
      const data = await staticAssetService.readAsset(normalizedPath);
      return new Response(new Uint8Array(data), {
        headers: {
          "Content-Type": info?.contentType ?? "application/octet-stream",
          "Cache-Control": info?.cacheControl ?? "no-cache",
        },
      });
    }

    if (shouldReturnSpaIndex(c.req.method, c.req.path)) {
      const info = staticAssetService.getAssetInfo("index.html");
      const data = await staticAssetService.readIndexHtml();
      return new Response(new Uint8Array(data), {
        headers: {
          "Content-Type": info?.contentType ?? "text/html; charset=utf-8",
          "Cache-Control": info?.cacheControl ?? "no-cache",
        },
      });
    }

    return c.notFound();
  });

  app.on(["HEAD"], "*", async (c) => {
    if (!staticAssetService.isAvailable()) {
      return c.notFound();
    }

    const normalizedPath = staticAssetService.normalizeRequestPath(c.req.path);
    if (normalizedPath && staticAssetService.hasAsset(normalizedPath)) {
      const info = staticAssetService.getAssetInfo(normalizedPath);
      return new Response(null, {
        headers: {
          "Content-Type": info?.contentType ?? "application/octet-stream",
          "Cache-Control": info?.cacheControl ?? "no-cache",
        },
      });
    }

    if (shouldReturnSpaIndex(c.req.method, c.req.path)) {
      const info = staticAssetService.getAssetInfo("index.html");
      return new Response(null, {
        headers: {
          "Content-Type": info?.contentType ?? "text/html; charset=utf-8",
          "Cache-Control": info?.cacheControl ?? "no-cache",
        },
      });
    }

    return c.notFound();
  });

  return app;
}
