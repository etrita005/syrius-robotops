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
import type { RobotBasicInfo } from "../tasks/getRobotBasicInfoTask.js";
import type { TaskFlowEngine } from "./taskFlowEngine/taskFlowEngine.js";
import type { FlowSpec, ValueMap } from "flowed";

const SAFE_ID_RE = /^[a-zA-Z0-9_-][a-zA-Z0-9_.-]*$/;
const DEFAULT_SSH_USERNAME = "root";
const DEFAULT_SSH_PASSWORD = "";
const REFRESH_INTERVAL_MS = 10_000;
const LRU_CLEANUP_INTERVAL_MS = 30_000;
const LRU_TTL_MS = 3 * 60 * 1000;

class AsyncMutex {
  private queue: Array<() => void> = [];
  private locked = false;

  async lock(): Promise<void> {
    if (!this.locked) {
      this.locked = true;
      return;
    }
    return new Promise<void>((resolve) => {
      this.queue.push(resolve);
    });
  }

  unlock(): void {
    const next = this.queue.shift();
    if (next) {
      next();
    } else {
      this.locked = false;
    }
  }
}

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

export interface RobotWithBasicInfo extends StoredRobotData {
  basicInfo: RobotBasicInfo | null;
  basicInfoFetchedAt: string | null;
}

interface RobotInfoCacheEntry {
  info: RobotBasicInfo;
  fetchedAt: string;
}

interface SolutionRobotInfoEntry {
  robotInfoMap: Map<string, RobotInfoCacheEntry>;
  lastAccessedAt: number;
  refreshing: boolean;
}

export interface RobotServiceOptions {
  sshUsername?: string;
  sshPassword?: string;
}

export class RobotService {
  private obs: ObjectStore;
  private solutionRobots: Map<string, Map<string, StoredRobotData>> = new Map();
  private solutionRobotInfoMap: Map<string, SolutionRobotInfoEntry> = new Map();
  private solutionMutexes: Map<string, AsyncMutex> = new Map();
  private taskFlowEngine: TaskFlowEngine | null = null;
  private sshUsername: string;
  private sshPassword: string;
  private refreshTimer?: ReturnType<typeof setInterval>;
  private lruCleanupTimer?: ReturnType<typeof setInterval>;

  constructor(obs: ObjectStore, options?: RobotServiceOptions) {
    this.obs = obs;
    this.sshUsername = options?.sshUsername ?? DEFAULT_SSH_USERNAME;
    this.sshPassword = options?.sshPassword ?? DEFAULT_SSH_PASSWORD;
  }

  setTaskFlowEngine(engine: TaskFlowEngine): void {
    this.taskFlowEngine = engine;
  }

  startPeriodicRefresh(): void {
    if (this.refreshTimer) return;
    this.refreshTimer = setInterval(() => {
      this.refreshAllSolutions();
    }, REFRESH_INTERVAL_MS);
  }

  startLruCleanup(): void {
    if (this.lruCleanupTimer) return;
    this.lruCleanupTimer = setInterval(() => {
      this.cleanupLruEntries();
    }, LRU_CLEANUP_INTERVAL_MS);
  }

  destroy(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = undefined;
    }
    if (this.lruCleanupTimer) {
      clearInterval(this.lruCleanupTimer);
      this.lruCleanupTimer = undefined;
    }
  }

  private getMutex(solutionId: string): AsyncMutex {
    let mutex = this.solutionMutexes.get(solutionId);
    if (!mutex) {
      mutex = new AsyncMutex();
      this.solutionMutexes.set(solutionId, mutex);
    }
    return mutex;
  }

  async getRobotInfoList(solutionId: string): Promise<RobotWithBasicInfo[]> {
    const solutionExists = await this.obs.exists(`v1/solutions/${solutionId}/meta`);
    if (!solutionExists) {
      throw new SolutionNotFoundError(solutionId);
    }

    let needsRefresh = false;

    const mutex = this.getMutex(solutionId);
    await mutex.lock();
    try {
      let entry = this.solutionRobotInfoMap.get(solutionId);
      if (!entry) {
        entry = {
          robotInfoMap: new Map(),
          lastAccessedAt: Date.now(),
          refreshing: false,
        };
        this.solutionRobotInfoMap.set(solutionId, entry);
        needsRefresh = true;
      } else {
        entry.lastAccessedAt = Date.now();
      }
    } finally {
      mutex.unlock();
    }

    if (needsRefresh) {
      this.refreshSolutionRobotInfo(solutionId).catch(() => {});
    }

    const robots = await this.list(solutionId);

    const mutex2 = this.getMutex(solutionId);
    await mutex2.lock();
    try {
      const entry = this.solutionRobotInfoMap.get(solutionId);
      if (!entry) {
        return robots.map((robot) => ({
          ...robot,
          basicInfo: null,
          basicInfoFetchedAt: null,
        }));
      }
      return robots.map((robot) => {
        const cached = entry.robotInfoMap.get(robot.id);
        return {
          ...robot,
          basicInfo: cached?.info ?? null,
          basicInfoFetchedAt: cached?.fetchedAt ?? null,
        };
      });
    } finally {
      mutex2.unlock();
    }
  }

  async updateRobotInfoCache(solutionId: string, robotId: string, info: RobotBasicInfo): Promise<void> {
    const mutex = this.getMutex(solutionId);
    await mutex.lock();
    try {
      const entry = this.solutionRobotInfoMap.get(solutionId);
      if (!entry) return;
      entry.robotInfoMap.set(robotId, {
        info,
        fetchedAt: new Date().toISOString(),
      });
    } finally {
      mutex.unlock();
    }
  }

  private async refreshSolutionRobotInfo(solutionId: string): Promise<void> {
    const mutex = this.getMutex(solutionId);
    await mutex.lock();
    try {
      const entry = this.solutionRobotInfoMap.get(solutionId);
      if (!entry || entry.refreshing) return;
      entry.refreshing = true;
    } finally {
      mutex.unlock();
    }

    try {
      if (!this.taskFlowEngine) return;
      const robots = await this.list(solutionId);
      if (robots.length === 0) return;

      await Promise.allSettled(
        robots.map((robot) => this.createRobotInfoFlow(solutionId, robot))
      );
    } finally {
      const mutex2 = this.getMutex(solutionId);
      await mutex2.lock();
      try {
        const entry = this.solutionRobotInfoMap.get(solutionId);
        if (entry) entry.refreshing = false;
      } finally {
        mutex2.unlock();
      }
    }
  }

  private async createRobotInfoFlow(solutionId: string, robot: StoredRobotData): Promise<void> {
    if (!this.taskFlowEngine) return;

    const dag: FlowSpec = {
      tasks: {
        getBasicInfo: {
          requires: ["robotIp", "robotPort", "sshUsername", "sshPassword"],
          provides: ["robotInfo"],
          resolver: {
            name: "GetRobotBasicInfoTask",
            params: {
              robotIp: "robotIp",
              robotPort: "robotPort",
              sshUsername: "sshUsername",
              sshPassword: "sshPassword",
            },
            results: {
              robotInfo: "robotInfo",
            },
          },
        },
        updateBasicInfo: {
          requires: ["robotInfo", "solutionId", "robotId"],
          provides: ["updated"],
          resolver: {
            name: "UpdateRobotBasicInfoTask",
            params: {
              robotInfo: "robotInfo",
              solutionId: "solutionId",
              robotId: "robotId",
            },
            results: {
              updated: "updated",
            },
          },
        },
      },
    };

    const input: ValueMap = {
      robotIp: robot.address,
      robotPort: robot.port,
      sshUsername: this.sshUsername,
      sshPassword: this.sshPassword,
      solutionId,
      robotId: robot.id,
    };

    await this.taskFlowEngine.createFlow("internal", dag, input, ["updated"]);
  }

  private refreshAllSolutions(): void {
    for (const [solutionId] of this.solutionRobotInfoMap) {
      this.refreshSolutionRobotInfo(solutionId).catch(() => {});
    }
  }

  private cleanupLruEntries(): void {
    const now = Date.now();
    const expiredIds: string[] = [];
    for (const [solutionId, entry] of this.solutionRobotInfoMap) {
      if (now - entry.lastAccessedAt > LRU_TTL_MS) {
        expiredIds.push(solutionId);
      }
    }
    for (const id of expiredIds) {
      this.solutionRobotInfoMap.delete(id);
      this.solutionMutexes.delete(id);
    }
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

    const mutex = this.getMutex(solutionId);
    await mutex.lock();
    try {
      this.solutionRobotInfoMap.get(solutionId)?.robotInfoMap.delete(robotId);
    } finally {
      mutex.unlock();
    }
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
