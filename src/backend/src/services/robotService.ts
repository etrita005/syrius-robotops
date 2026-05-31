import { ObjectStore } from "./objectStore.js";
import {
  StoredRobotData,
  CreateRobotInput,
  ParsedAddress,
} from "../types/robot.js";
import {
  SolutionNotFoundError,
  RobotNotFoundError,
  InvalidRobotIdError,
  InvalidRobotAddressError,
  RobotAddressExistsError,
} from "../errors/appErrors.js";

const SAFE_ID_RE = /^[a-zA-Z0-9_-][a-zA-Z0-9_.-]*$/;

function generateRobotId(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let id = "";
  for (let i = 0; i < 6; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return `robot-${id}`;
}

function isMdns(host: string): boolean {
  return !/^(\d{1,3}\.){3}\d{1,3}$/.test(host);
}

function parseAddressInput(input: string): ParsedAddress | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const lastColon = trimmed.lastIndexOf(":");
  if (lastColon > 0) {
    const host = trimmed.substring(0, lastColon);
    const portStr = trimmed.substring(lastColon + 1);
    const port = parseInt(portStr, 10);
    if (isNaN(port) || port < 1 || port > 65535 || portStr !== String(port)) {
      return null;
    }
    if (host.length === 0 || host.length > 256) return null;
    return { host, port, addressType: isMdns(host) ? "mdns" : "ip" };
  }

  if (lastColon === 0) return null;

  if (trimmed.length > 256) return null;
  return { host: trimmed, port: 22, addressType: isMdns(trimmed) ? "mdns" : "ip" };
}

function validateRobotId(id: string): void {
  if (!SAFE_ID_RE.test(id)) {
    throw new InvalidRobotIdError(id);
  }
}

export class RobotService {
  private obs: ObjectStore;
  private solutionRobots: Map<string, Map<string, StoredRobotData>> = new Map();

  constructor(obs: ObjectStore) {
    this.obs = obs;
  }

  async list(solutionId: string): Promise<StoredRobotData[]> {
    const solutionExists = await this.obs.exists(`v1/solutions/${solutionId}/meta`);
    if (!solutionExists) {
      throw new SolutionNotFoundError(solutionId);
    }

    const cached = this.solutionRobots.get(solutionId);
    if (cached) {
      return Array.from(cached.values());
    }

    const resources = await this.obs.list(`v1/solutions/${solutionId}/robots`);
    const robots: StoredRobotData[] = [];

    for (const res of resources) {
      if (res.type === "file" && res.name !== "_keep") {
        const stored = await this.obs.getJson<StoredRobotData>(`v1/solutions/${solutionId}/robots/${res.name}`);
        if (stored) robots.push(stored);
      }
    }

    const robotMap = new Map<string, StoredRobotData>();
    for (const robot of robots) {
      robotMap.set(robot.id, robot);
    }
    this.solutionRobots.set(solutionId, robotMap);

    return robots;
  }

  async get(solutionId: string, robotId: string): Promise<StoredRobotData> {
    const solutionExists = await this.obs.exists(`v1/solutions/${solutionId}/meta`);
    if (!solutionExists) {
      throw new SolutionNotFoundError(solutionId);
    }

    validateRobotId(robotId);

    const cached = this.solutionRobots.get(solutionId)?.get(robotId);
    if (cached) return cached;

    const stored = await this.obs.getJson<StoredRobotData>(`v1/solutions/${solutionId}/robots/${robotId}`);
    if (!stored) {
      throw new RobotNotFoundError(robotId);
    }
    return stored;
  }

  async create(solutionId: string, input: CreateRobotInput): Promise<StoredRobotData> {
    const solutionExists = await this.obs.exists(`v1/solutions/${solutionId}/meta`);
    if (!solutionExists) {
      throw new SolutionNotFoundError(solutionId);
    }

    const parsed = parseAddressInput(input.address);
    if (!parsed) {
      throw new InvalidRobotAddressError();
    }

    await this.ensureLoaded(solutionId);
    const existingRobots = this.solutionRobots.get(solutionId)!;
    for (const robot of existingRobots.values()) {
      if (robot.address === parsed.host && robot.port === parsed.port) {
        throw new RobotAddressExistsError();
      }
    }

    const id = generateRobotId();
    const alias = input.alias?.trim() || parsed.host;
    const now = new Date().toISOString();
    const stored: StoredRobotData = {
      id,
      address: parsed.host,
      addressType: parsed.addressType,
      alias,
      port: parsed.port,
      createdAt: now,
      updatedAt: now,
    };

    await this.obs.putJson(`v1/solutions/${solutionId}/robots/${id}`, stored);

    existingRobots.set(id, stored);

    return stored;
  }

  async update(
    solutionId: string,
    robotId: string,
    patch: Partial<Pick<StoredRobotData, "alias" | "address" | "port">>
  ): Promise<StoredRobotData> {
    const solutionExists = await this.obs.exists(`v1/solutions/${solutionId}/meta`);
    if (!solutionExists) {
      throw new SolutionNotFoundError(solutionId);
    }

    validateRobotId(robotId);

    await this.ensureLoaded(solutionId);
    const existingRobots = this.solutionRobots.get(solutionId)!;
    const current = existingRobots.get(robotId)
      ?? await this.obs.getJson<StoredRobotData>(`v1/solutions/${solutionId}/robots/${robotId}`);

    if (!current) {
      throw new RobotNotFoundError(robotId);
    }

    const resolvedPatch: Partial<StoredRobotData> = {};

    if (patch.alias !== undefined) {
      resolvedPatch.alias = patch.alias;
    }

    if (patch.address !== undefined) {
      const parsed = parseAddressInput(patch.address);
      if (!parsed) {
        throw new InvalidRobotAddressError();
      }
      for (const robot of existingRobots.values()) {
        if (robot.id !== robotId && robot.address === parsed.host && robot.port === parsed.port) {
          throw new RobotAddressExistsError();
        }
      }
      resolvedPatch.address = parsed.host;
      resolvedPatch.addressType = parsed.addressType;
      resolvedPatch.port = parsed.port;
    } else if (patch.port !== undefined) {
      resolvedPatch.port = patch.port;
    }

    const updated: StoredRobotData = {
      ...current,
      ...resolvedPatch,
      updatedAt: new Date().toISOString(),
    };

    await this.obs.putJson(`v1/solutions/${solutionId}/robots/${robotId}`, updated);

    existingRobots.set(robotId, updated);

    return updated;
  }

  async remove(solutionId: string, robotId: string): Promise<void> {
    const solutionExists = await this.obs.exists(`v1/solutions/${solutionId}/meta`);
    if (!solutionExists) {
      throw new SolutionNotFoundError(solutionId);
    }

    validateRobotId(robotId);

    const robotExists = await this.obs.exists(`v1/solutions/${solutionId}/robots/${robotId}`);
    if (!robotExists) {
      throw new RobotNotFoundError(robotId);
    }

    await this.obs.deletePath(`v1/solutions/${solutionId}/robots/${robotId}`);

    this.solutionRobots.get(solutionId)?.delete(robotId);
  }

  removeSolutionCache(solutionId: string): void {
    this.solutionRobots.delete(solutionId);
  }

  private async ensureLoaded(solutionId: string): Promise<void> {
    if (this.solutionRobots.has(solutionId)) return;

    const resources = await this.obs.list(`v1/solutions/${solutionId}/robots`);
    const robotMap = new Map<string, StoredRobotData>();

    for (const res of resources) {
      if (res.type === "file" && res.name !== "_keep") {
        const stored = await this.obs.getJson<StoredRobotData>(`v1/solutions/${solutionId}/robots/${res.name}`);
        if (stored) robotMap.set(stored.id, stored);
      }
    }

    this.solutionRobots.set(solutionId, robotMap);
  }
}

export { parseAddressInput };
