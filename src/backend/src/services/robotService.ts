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
import type { RobotBasicInfo } from "../tasks/real/getRobotBasicInfoTask.js";
import type { RobotSoftwareInfo } from "../tasks/real/getRobotSoftwareInfoTask.js";
import { MemStore } from "../memStore/index.js";
import type { CacheEntry, CacheEventHandler, IMemStore } from "../memStore/index.js";
import { TaskFlowEngine } from "./taskFlowEngine/index.js";
import type { SseManager, ISseManagerEventHandler } from "./sseManager.js";
import { logger } from "../logger/index.js";

const SAFE_ID_RE = /^[a-zA-Z0-9_-][a-zA-Z0-9_.-]*$/;
const ROBOT_INFO_TTL_MS = 5 * 60 * 1000;
const ROBOT_INFO_CRON = "*/180";
const ROBOT_INFO_KEY_PREFIX = "robot:";

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

export function buildRobotInfoKey(solutionId: string, robotId: string): string {
  return `${ROBOT_INFO_KEY_PREFIX}${solutionId}/${robotId}`;
}

export function buildRobotSoftwareInfoKey(solutionId: string, robotId: string): string {
  return `${buildRobotInfoKey(solutionId, robotId)}/sw`;
}

export interface RobotWithBasicInfo extends StoredRobotData {
  basicInfo: RobotBasicInfo | null;
  softwareInfo: RobotSoftwareInfo | null;
  basicInfoFetchedAt: string | null;
}

export interface RobotServiceOptions {
  sshUsername?: string;
  sshPassword?: string;
}

export class RobotCacheEventHandler implements CacheEventHandler, ISseManagerEventHandler {
  private sseManager: SseManager;
  private engine: TaskFlowEngine;
  private memStore: MemStore;
  private getRobotAddress: (solutionId: string, robotId: string) => Promise<{ address: string; port: number } | null>;
  private sshUsername: string;
  private sshPassword: string;

  constructor(
    sseManager: SseManager,
    engine: TaskFlowEngine,
    memStore: MemStore,
    getRobotAddress: (solutionId: string, robotId: string) => Promise<{ address: string; port: number } | null>,
    sshUsername: string,
    sshPassword: string
  ) {
    this.sseManager = sseManager;
    this.engine = engine;
    this.memStore = memStore;
    this.getRobotAddress = getRobotAddress;
    this.sshUsername = sshUsername;
    this.sshPassword = sshPassword;
  }

  onCreated(store: IMemStore, entry: CacheEntry): void {
    this.executeRefreshFlow(store, entry);
  }

  onUpdate(store: IMemStore, entry: CacheEntry): void {
    this.executeRefreshFlow(store, entry);
  }

  onValueChanged(_store: IMemStore, entry: CacheEntry): void {
    this.emitEntryUpdated(entry);
  }

  onDeleted(_store: IMemStore, entry: CacheEntry): void {
    this.emitEntryDeleted(entry);
  }

  onClientConnected(sseManager: SseManager, clientId: string): void {
    for (const entry of this.memStore.listCaches()) {
      if (entry.hasValue) {
        sseManager.sendToClient(clientId, "memstore/entry-current", {
          key: entry.key,
          value: entry.value,
          properties: entry.properties,
        });
      }
    }
  }

  onClientDisconnected(_sseManager: SseManager, _clientId: string): void {
    // No per-client state to clean up.
  }

  private emitEntryUpdated(entry: CacheEntry): void {
    this.sseManager.broadcast("memstore/entry-updated", {
      key: entry.key,
      value: entry.value,
      properties: entry.properties,
    });
  }

  private emitEntryDeleted(entry: CacheEntry): void {
    this.sseManager.broadcast("memstore/entry-deleted", {
      key: entry.key,
    });
  }

  private executeRefreshFlow(store: IMemStore, entry: CacheEntry): void {
    const solutionId = entry.properties.solutionId as string | undefined;
    const robotId = entry.properties.robotId as string | undefined;
    if (!solutionId || !robotId) {
      logger.warn({ key: entry.key }, "Missing solutionId or robotId in cache properties");
      store.clearRefreshing(entry.key);
      return;
    }

    const swKey = buildRobotSoftwareInfoKey(solutionId, robotId);

    this.getRobotAddress(solutionId, robotId).then((robotAddr) => {
      if (!robotAddr) {
        logger.warn({ key: entry.key }, "Robot not found");
        store.clearRefreshing(entry.key);
        return;
      }

      const dag = {
        tasks: {
          fetchInfo: {
            resolver: {
              name: "GetRobotBasicInfoTask",
              results: { robotInfo: "robotInfo" },
              params: {
                sshUsername: { value: this.sshUsername },
                sshPassword: { value: this.sshPassword },
                robotIp: { value: robotAddr.address },
                robotPort: { value: robotAddr.port },
              },
            },
            provides: ["robotInfo"],
          },
          fetchSoftwareInfo: {
            requires: ["robotInfo"],
            resolver: {
              name: "GetRobotSoftwareInfoTask",
              results: { softwareInfo: "softwareInfo" },
              params: {
                sshUsername: { value: this.sshUsername },
                sshPassword: { value: this.sshPassword },
                robotIp: { value: robotAddr.address },
                robotPort: { value: robotAddr.port },
              },
            },
            provides: ["softwareInfo"],
          },
          updateInfo: {
            requires: ["robotInfo"],
            resolver: {
              name: "UpdateRobotBasicInfoTask",
              params: {
                robotInfo: "robotInfo",
                cacheKey: { value: entry.key },
              },
            },
          },
          updateSoftwareInfo: {
            requires: ["softwareInfo"],
            resolver: {
              name: "UpdateRobotSoftwareInfoTask",
              params: {
                softwareInfo: "softwareInfo",
                cacheKey: { value: swKey },
              },
            },
          },
        },
      };

      this.engine
        .createFlow("internal", dag as any)
        .catch((err: unknown) => {
          logger.error({ key: entry.key, err: err instanceof Error ? err.message : String(err) }, "Failed to create refresh flow");
        })
        .finally(() => store.clearRefreshing(entry.key));
    }).catch((err: unknown) => {
      logger.error({ key: entry.key, err: err instanceof Error ? err.message : String(err) }, "Error getting robot address");
      store.clearRefreshing(entry.key);
    });
  }
}

export class RobotService {
  private obs: ObjectStore;
  private solutionRobots: Map<string, Map<string, StoredRobotData>> = new Map();
  private sshUsername: string;
  private sshPassword: string;
  public readonly memStore: MemStore;
  public readonly sseManager: SseManager;

  constructor(
    obs: ObjectStore,
    engine: TaskFlowEngine,
    sseManager: SseManager,
    memStore: MemStore,
    options?: RobotServiceOptions
  ) {
    this.obs = obs;
    this.sshUsername = options?.sshUsername ?? "root";
    this.sshPassword = options?.sshPassword ?? "";

    this.sseManager = sseManager;
    this.memStore = memStore;

    const handler = new RobotCacheEventHandler(
      sseManager,
      engine,
      memStore,
      this.getRobotAddress.bind(this),
      this.sshUsername,
      this.sshPassword
    );

    this.memStore.setHandler(handler);
    this.sseManager.registerHandler(handler);
  }

  async getRobotInfoList(solutionId: string): Promise<RobotWithBasicInfo[]> {
    const solutionExists = await this.obs.exists(`v1/solutions/${solutionId}/meta`);
    if (!solutionExists) {
      throw new SolutionNotFoundError(solutionId);
    }

    const robots = await this.list(solutionId);

    return robots.map((robot) => {
      const key = buildRobotInfoKey(solutionId, robot.id);
      const swKey = buildRobotSoftwareInfoKey(solutionId, robot.id);
      const cached = this.memStore.getCache(key) as RobotBasicInfo | undefined;
      const swCached = this.memStore.getCache(swKey) as RobotSoftwareInfo | undefined;

      if (cached || swCached) {
        return {
          ...robot,
          basicInfo: cached ?? null,
          softwareInfo: swCached ?? null,
          basicInfoFetchedAt: null,
        };
      }

      this.memStore.triggerRefresh(key);

      return {
        ...robot,
        basicInfo: null,
        softwareInfo: null,
        basicInfoFetchedAt: null,
      };
    });
  }

  async getRobotInfo(solutionId: string, robotId: string): Promise<RobotWithBasicInfo> {
    const robot = await this.get(solutionId, robotId);
    const key = buildRobotInfoKey(solutionId, robotId);
    const swKey = buildRobotSoftwareInfoKey(solutionId, robotId);
    const cached = this.memStore.getCache(key) as RobotBasicInfo | undefined;
    const swCached = this.memStore.getCache(swKey) as RobotSoftwareInfo | undefined;

    if (cached || swCached) {
      return {
        ...robot,
        basicInfo: cached ?? null,
        softwareInfo: swCached ?? null,
        basicInfoFetchedAt: null,
      };
    }

    this.memStore.triggerRefresh(key);

    return {
      ...robot,
      basicInfo: null,
      softwareInfo: null,
      basicInfoFetchedAt: null,
    };
  }

  private ensureRobotInfoCache(solutionId: string, robot: StoredRobotData): void {
    const key = buildRobotInfoKey(solutionId, robot.id);
    const swKey = buildRobotSoftwareInfoKey(solutionId, robot.id);

    if (!this.memStore.hasCache(key)) {
      this.memStore.createCache(key, {
        ttlMs: ROBOT_INFO_TTL_MS,
        cron: ROBOT_INFO_CRON,
      }, {
        properties: { solutionId, robotId: robot.id },
      });
    }

    if (!this.memStore.hasCache(swKey)) {
      this.memStore.createCache(swKey, {
        ttlMs: ROBOT_INFO_TTL_MS,
        cron: ROBOT_INFO_CRON,
      }, {
        properties: { solutionId, robotId: robot.id, software: true },
      });
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

    for (const robot of robots) {
      this.ensureRobotInfoCache(solutionId, robot);
    }

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

    this.ensureRobotInfoCache(solutionId, stored);

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

    const addressChanged = resolvedPatch.address !== undefined || resolvedPatch.port !== undefined;
    if (addressChanged) {
      const oldKey = buildRobotInfoKey(solutionId, robotId);
      const oldSwKey = buildRobotSoftwareInfoKey(solutionId, robotId);
      this.memStore.deleteCache(oldKey);
      this.memStore.deleteCache(oldSwKey);
      this.ensureRobotInfoCache(solutionId, updated);
    }

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

    const infoKey = buildRobotInfoKey(solutionId, robotId);
    const swKey = buildRobotSoftwareInfoKey(solutionId, robotId);
    this.memStore.deleteCache(infoKey);
    this.memStore.deleteCache(swKey);
  }

  removeSolutionCache(solutionId: string): void {
    this.solutionRobots.delete(solutionId);

    const prefix = `${ROBOT_INFO_KEY_PREFIX}${solutionId}/`;
    this.memStore.deleteByPrefix(prefix);
  }

  private async getRobotAddress(solutionId: string, robotId: string): Promise<{ address: string; port: number } | null> {
    const robot = this.solutionRobots.get(solutionId)?.get(robotId);
    if (robot) return { address: robot.address, port: robot.port };
    const stored = await this.obs.getJson<StoredRobotData>(`v1/solutions/${solutionId}/robots/${robotId}`);
    if (!stored) return null;
    return { address: stored.address, port: stored.port };
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

    for (const robot of robotMap.values()) {
      this.ensureRobotInfoCache(solutionId, robot);
    }
  }
}

export { parseAddressInput };
