import { readFile, writeFile, unlink, readdir, mkdir, access } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

let baseDir: string = join(process.cwd(), "data");

export function configure(dir: string): void {
  baseDir = dir;
}

const RESOURCE_NAME_RE = /^[a-zA-Z0-9_-]+$/;
const SAFE_ID_RE = /^[a-zA-Z0-9_-]+$/;

function validateResourceName(name: string): void {
  if (!RESOURCE_NAME_RE.test(name)) {
    throw new Error(`Invalid resource name: "${name}". Allowed: letters, digits, hyphens, underscores.`);
  }
}

function validateId(id: string): void {
  if (!SAFE_ID_RE.test(id)) {
    throw new Error(`Invalid id: "${id}".`);
  }
}

async function ensureDir(dir: string): Promise<void> {
  try {
    await access(dir);
  } catch {
    await mkdir(dir, { recursive: true });
  }
}

export interface StoredObject {
  id: string;
  [key: string]: unknown;
}

export async function list(resource: string): Promise<StoredObject[]> {
  validateResourceName(resource);
  const dir = join(baseDir, resource);
  await ensureDir(dir);
  const files = await readdir(dir);
  const results: StoredObject[] = [];
  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    const content = await readFile(join(dir, file), "utf-8");
    results.push(JSON.parse(content) as StoredObject);
  }
  return results;
}

export async function get(resource: string, id: string): Promise<StoredObject | null> {
  validateResourceName(resource);
  validateId(id);
  const filePath = join(baseDir, resource, `${id}.json`);
  try {
    const content = await readFile(filePath, "utf-8");
    return JSON.parse(content) as StoredObject;
  } catch {
    return null;
  }
}

export async function create(resource: string, data: Record<string, unknown>): Promise<StoredObject> {
  validateResourceName(resource);
  const dir = join(baseDir, resource);
  await ensureDir(dir);
  const id = randomUUID();
  const obj: StoredObject = { id, ...data };
  await writeFile(join(dir, `${id}.json`), JSON.stringify(obj, null, 2), "utf-8");
  return obj;
}

export async function update(
  resource: string,
  id: string,
  data: Record<string, unknown>,
): Promise<StoredObject | null> {
  validateResourceName(resource);
  validateId(id);
  const filePath = join(baseDir, resource, `${id}.json`);
  const existing = await get(resource, id);
  if (!existing) return null;
  const updated: StoredObject = { ...data, id };
  await writeFile(filePath, JSON.stringify(updated, null, 2), "utf-8");
  return updated;
}

export async function remove(resource: string, id: string): Promise<boolean> {
  validateResourceName(resource);
  validateId(id);
  const filePath = join(baseDir, resource, `${id}.json`);
  try {
    await unlink(filePath);
    return true;
  } catch {
    return false;
  }
}