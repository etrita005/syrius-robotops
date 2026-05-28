import { get, post, put, del } from "./client.js";

export interface ObjectStoreResource {
  name: string;
  type: "file" | "directory";
  contentType?: string;
  size?: number;
}

export async function listObjects(path: string): Promise<ObjectStoreResource[]> {
  return get<ObjectStoreResource[]>(`/objects/list/${path}`);
}

export async function getObject<T = unknown>(path: string): Promise<T> {
  return get<T>(`/objects/${path}`);
}

export async function putObject(path: string, data: unknown): Promise<{ ok: boolean }> {
  return put<{ ok: boolean }>(`/objects/${path}`, data);
}

export async function deleteObject(path: string): Promise<{ ok: boolean }> {
  return del<{ ok: boolean }>(`/objects/${path}`);
}

export async function cloneObject(sourcePath: string, targetPath: string): Promise<{ ok: boolean }> {
  return post<{ ok: boolean }>("/objects/clone", { sourcePath, targetPath });
}

export async function exportObject(sourcePath: string, destinationPath?: string): Promise<{ filePath: string }> {
  return post<{ filePath: string }>("/objects/export", { sourcePath, destinationPath });
}

export async function importObject(zipPath: string, targetPath: string): Promise<{ ok: boolean }> {
  return post<{ ok: boolean }>("/objects/import", { zipPath, targetPath });
}
