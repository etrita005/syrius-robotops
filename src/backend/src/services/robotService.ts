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
import { MemStore } from "../memStore/index.js";
import type { CacheEntry, CacheEventHandler, IMemStore } from "../memStore/index.js";
import { TaskFlowEngine } from "./taskFlowEngine/index.js";
import type { SseManager, ISseManagerEventHandler } from "./sseManager.js";

const SAFE_ID_RE = /^[a-zA-Z0-9_-][a-zA-Z0-9_.-]*$/;
const DEFAULT_SSH_USERNAME = "root";
const DEFAULT_SSH_PASSWORD = "";
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

export interface RobotWithBasicInfo extends StoredRobotData {
  basicInfo: RobotBasicInfo | null;
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

  constructor(
    sseManager: SseManager,
    engine: TaskFlowEngine,
    memStore: MemStore,
    getRobotAddress: (solutionId: string, robotId: string) => Promise<{ address: string; port: number } | null>
  ) {
    this.sseManager = sseManager;
    this.engine = engine;
    this.memStore = memStore;
    this.getRobotAddress = getRobotAddress;
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
    const taskFlowSpec = entry.properties.taskFlowSpec;
    if (!taskFlowSpec) {
      console.warn(`[RobotCacheEventHandler] No taskFlowSpec in properties for key: ${entry.key}`);
      store.clearRefreshing(entry.key);
      return;
    }

    this.getRobotAddress(
      entry.properties.solutionId as string,
      entry.properties.robotId as string
    ).then((robotAddr) => {
      if (!robotAddr) {
        console.warn(`[RobotCacheEventHandler] Robot not found for key: ${entry.key}`);
        store.clearRefreshing(entry.key);
        return;
      }

      const spec = this.buildSpec(entry.key, robotAddr, taskFlowSpec as Record<string, unknown>);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      this.engine
        .createFlow("internal", spec as any)
        .catch((err: unknown) => {
          console.error(`[RobotCacheEventHandler] Failed to create refresh flow for key ${entry.key}:`, err instanceof Error ? err.message : String(err));
        })
        .finally(() => store.clearRefreshing(entry.key));
    }).catch((err: unknown) => {
      console.error(`[RobotCacheEventHandler] Error getting robot address for key ${entry.key}:`, err instanceof Error ? err.message : String(err));
      store.clearRefreshing(entry.key);
    });
  }

  private buildSpec(key: string, robotAddr: { address: string; port: number }, taskFlowSpec: Record<string, unknown>): Record<string, unknown> {
    if (taskFlowSpec.tasks && typeof taskFlowSpec.tasks === "object") {
      const tasks = { ...taskFlowSpec.tasks } as Record<string, unknown>;
      if (tasks.fetchInfo && typeof tasks.fetchInfo === "object") {
        const fetchInfo = { ...(tasks.fetchInfo as Record<string, unknown>) };
        if (fetchInfo.resolver && typeof fetchInfo.resolver === "object") {
          const resolver = { ...(fetchInfo.resolver as Record<string, unknown>) };
          if (resolver.params && typeof resolver.params === "object") {
            const params = { ...(resolver.params as Record<string, unknown>) };
            params.robotIp = { value: robotAddr.address };
            params.robotPort = { value: robotAddr.port };
            resolver.params = params;
          }
          fetchInfo.resolver = resolver;
        }
        tasks.fetchInfo = fetchInfo;
      }
      if (tasks.updateInfo && typeof tasks.updateInfo === "object") {
        const updateInfo = { ...(tasks.updateInfo as Record<string, unknown>) };
        if (updateInfo.resolver && typeof updateInfo.resolver === "object") {
          const resolver = { ...(updateInfo.resolver as Record<string, unknown>) };
          if (resolver.params && typeof resolver.params === "object") {
            const params = { ...(resolver.params as Record<string, unknown>) };
            params.cacheKey = { value: key };
            resolver.params = params;
          }
          updateInfo.resolver = resolver;
        }
        tasks.updateInfo = updateInfo;
      }
      return { ...taskFlowSpec, tasks };
    }
    return taskFlowSpec;
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
    this.sshUsername = options?.sshUsername ?? DEFAULT_SSH_USERNAME;
    this.sshPassword = options?.sshPassword ?? DEFAULT_SSH_PASSWORD;

    this.sseManager = sseManager;
    this.memStore = memStore;

    const handler = new RobotCacheEventHandler(
      sseManager,
      engine,
      memStore,
      this.getRobotAddress.bind(this)
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
      const cached = this.memStore.getCache(key) as RobotBasicInfo | undefined;

      if (cached) {
        return {
          ...robot,
          basicInfo: cached,
          basicInfoFetchedAt: null,
        };
      }

      this.memStore.triggerRefresh(key);

      return {
        ...robot,
        basicInfo: null,
        basicInfoFetchedAt: null,
      };
    });
  }

  async getRobotInfo(solutionId: string, robotId: string): Promise<RobotWithBasicInfo> {
    const robot = await this.get(solutionId, robotId);
    const key = buildRobotInfoKey(solutionId, robotId);
    const cached = this.memStore.getCache(key) as RobotBasicInfo | undefined;

    if (cached) {
      return {
        ...robot,
        basicInfo: cached,
        basicInfoFetchedAt: null,
      };
    }

    this.memStore.triggerRefresh(key);

    return {
      ...robot,
      basicInfo: null,
      basicInfoFetchedAt: null,
    };
  }

  private ensureRobotInfoCache(solutionId: string, robot: StoredRobotData): void {
    const key = buildRobotInfoKey(solutionId, robot.id);

    if (this.memStore.hasCache(key)) return;

    const taskFlowSpec = {
      tasks: {
        fetchInfo: {
          resolver: {
            name: "GetRobotBasicInfoTask",
            results: { robotInfo: "robotInfo" },
            params: {
              sshUsername: { value: this.sshUsername },
              sshPassword: { value: this.sshPassword },
            },
          },
          provides: ["robotInfo"],
        },
        updateInfo: {
          requires: ["robotInfo"],
          resolver: {
            name: "UpdateRobotBasicInfoTask",
            params: {
              robotInfo: "robotInfo",
            },
          },
        },
      },
    };

    this.memStore.createCache(key, {
      ttlMs: ROBOT_INFO_TTL_MS,
      cron: ROBOT_INFO_CRON,
    }, {
      properties: {
        solutionId,
        robotId: robot.id,
        taskFlowSpec,
      },
    });
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
      this.memStore.deleteCache(oldKey);
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
    this.memStore.deleteCache(infoKey);
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
