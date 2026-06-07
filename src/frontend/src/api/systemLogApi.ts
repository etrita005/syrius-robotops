import { get, post } from "./client.js";
import type {
  LogFileInfo,
  LogQueryRequest,
  LogQueryResponse,
  LogBundleRequest,
} from "../types/systemLog.js";

export const systemLogApi = {
  async listFiles(): Promise<{ files: LogFileInfo[] }> {
    return get<{ files: LogFileInfo[] }>("/system-logs/files");
  },

  async listModules(): Promise<{ modules: string[] }> {
    return get<{ modules: string[] }>("/system-logs/modules");
  },

  async query(req: LogQueryRequest): Promise<LogQueryResponse> {
    const params = new URLSearchParams();
    if (req.from) params.set("from", req.from);
    if (req.to) params.set("to", req.to);
    if (req.levels?.length) params.set("levels", req.levels.join(","));
    if (req.modules?.length) params.set("modules", req.modules.join(","));
    if (req.q) params.set("q", req.q);
    if (req.order) params.set("order", req.order);
    if (req.limit) params.set("limit", String(req.limit));
    if (req.cursor) params.set("cursor", req.cursor);
    const qs = params.toString();
    return get<LogQueryResponse>(`/system-logs/query${qs ? `?${qs}` : ""}`);
  },

  downloadBundle(req: LogBundleRequest): Promise<Blob> {
    return fetch("/api/system-logs/download", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
    }).then(async (res) => {
      if (!res.ok) {
        const body = await res.json().catch(() => ({ message: "Unknown error" }));
        throw new Error(body.error ?? body.message ?? `HTTP ${res.status}`);
      }
      return res.blob();
    });
  },

  downloadFileUrl(name: string): string {
    return `/api/system-logs/files/${encodeURIComponent(name)}/download`;
  },
};
