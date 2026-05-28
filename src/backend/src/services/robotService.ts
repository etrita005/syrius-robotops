import { ObjectStore } from "./objectStore.js";
import {
  RobotDefinition,
  CreateRobotInput,
  RobotListOptions,
  HardwareDeviceNode,
} from "../types/robot.js";
import {
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

function isMdns(address: string): boolean {
  return !/^(\d{1,3}\.){3}\d{1,3}$/.test(address);
}

function seededRandom(seed: string): () => number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    const char = seed.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return () => {
    hash = (hash * 16807 + 0) % 2147483647;
    return (hash & 0x7fffffff) / 2147483647;
  };
}

function generateMockRobotInfo(address: string, alias: string): Omit<RobotDefinition, "id" | "createdAt" | "updatedAt"> {
  const rand = seededRandom(address);
  const randInt = (min: number, max: number) => Math.floor(rand() * (max - min + 1)) + min;
  const randVersion = () => `${randInt(1, 5)}.${randInt(0, 9)}.${randInt(0, 9)}`;
  const randSN = (prefix: string) => `${prefix}-${randInt(100000, 999999)}`;

  const models = ["X100", "X200", "X300", "T500", "M1000"];
  const model = models[randInt(0, models.length - 1)];

  const mcuNames = ["mcu1", "mcu2", "mcu3"];
  const actuatorNames = ["motor1", "motor2", "motor3", "motor4"];
  const sensorNames = ["lidar", "camera", "imu", "encoder", "battery"];

  const mcuFirmwareVersions: Record<string, string> = {};
  const mcuHardwareVersions: Record<string, string> = {};
  for (const name of mcuNames) {
    mcuFirmwareVersions[name] = randVersion();
    mcuHardwareVersions[name] = `Rev.${String.fromCharCode(65 + randInt(0, 4))}`;
  }

  const actuatorFirmwareVersions: Record<string, string> = {};
  const actuatorHardwareVersions: Record<string, string> = {};
  for (const name of actuatorNames) {
    actuatorFirmwareVersions[name] = randVersion();
    actuatorHardwareVersions[name] = `Rev.${String.fromCharCode(65 + randInt(0, 4))}`;
  }

  const sensorFirmwareVersions: Record<string, string> = {};
  const sensorHardwareVersions: Record<string, string> = {};
  for (const name of sensorNames) {
    sensorFirmwareVersions[name] = randVersion();
    sensorHardwareVersions[name] = `Rev.${String.fromCharCode(65 + randInt(0, 4))}`;
  }

  const hardwareDeviceTree: HardwareDeviceNode[] = [
    {
      name: "MainController",
      firmwareVersion: randVersion(),
      hardwareVersion: `Rev.${String.fromCharCode(65 + randInt(0, 4))}`,
      serialNumber: randSN("MB"),
      hardwareId: randSN("MB-ID"),
      online: true,
    },
    ...mcuNames.map((name) => ({
      name,
      firmwareVersion: mcuFirmwareVersions[name],
      hardwareVersion: mcuHardwareVersions[name],
      serialNumber: randSN(name.toUpperCase()),
      hardwareId: randSN(`${name.toUpperCase()}-ID`),
      parentName: "MainController",
      online: rand() > 0.1,
    })),
    ...actuatorNames.map((name) => ({
      name,
      firmwareVersion: actuatorFirmwareVersions[name],
      hardwareVersion: actuatorHardwareVersions[name],
      serialNumber: randSN(name.toUpperCase()),
      hardwareId: randSN(`${name.toUpperCase()}-ID`),
      parentName: mcuNames[randInt(0, mcuNames.length - 1)],
      online: rand() > 0.1,
    })),
    ...sensorNames.map((name) => ({
      name,
      firmwareVersion: sensorFirmwareVersions[name],
      hardwareVersion: sensorHardwareVersions[name],
      serialNumber: randSN(name.toUpperCase()),
      hardwareId: randSN(`${name.toUpperCase()}-ID`),
      parentName: mcuNames[randInt(0, mcuNames.length - 1)],
      online: rand() > 0.1,
    })),
  ];

  return {
    address,
    addressType: isMdns(address) ? "mdns" : "ip",
    alias: alias || address,
    model,
    robotSN: randSN("SN"),
    thingsId: randSN("THING"),
    vendorId: "SYRIUS",
    productId: `${model}-STD`,
    mainboardSN: randSN("MB-SN"),
    mainboardId: randSN("MB-ID"),
    mainSOMId: randSN("SOM-ID"),
    megaCosmOSVersion: randVersion(),
    movebaseVersion: randVersion(),
    ggrVersion: randVersion(),
    mcuFirmwareVersions,
    actuatorFirmwareVersions,
    sensorFirmwareVersions,
    mainControlHardwareVersion: `Rev.${String.fromCharCode(65 + randInt(0, 4))}`,
    mcuHardwareVersions,
    actuatorHardwareVersions,
    sensorHardwareVersions,
    hardwareDeviceTree,
  };
}

export class RobotService {
  private obs: ObjectStore;

  constructor(obs: ObjectStore) {
    this.obs = obs;
  }

  async create(solutionId: string, input: CreateRobotInput): Promise<RobotDefinition> {
    const address = input.address.trim();
    if (!address || address.length > 256) {
      throw new InvalidRobotAddressError();
    }

    const existing = await this.list(solutionId);
    if (existing.some((r) => r.address === address)) {
      throw new RobotAddressExistsError(address);
    }

    const robotId = generateRobotId();
    const now = new Date().toISOString();
    const mockInfo = generateMockRobotInfo(address, input.alias?.trim() || address);

    const robot: RobotDefinition = {
      id: robotId,
      ...mockInfo,
      createdAt: now,
      updatedAt: now,
    };

    await this.obs.putJson(`v1/solutions/${solutionId}/robots/${robotId}`, robot);
    return robot;
  }

  async createBatch(
    solutionId: string,
    inputs: CreateRobotInput[]
  ): Promise<{ succeeded: RobotDefinition[]; failed: { input: CreateRobotInput; reason: string }[] }> {
    const succeeded: RobotDefinition[] = [];
    const failed: { input: CreateRobotInput; reason: string }[] = [];

    const existing = await this.list(solutionId);
    const existingAddresses = new Set(existing.map((r) => r.address));

    for (const input of inputs) {
      const address = input.address.trim();
      if (!address || address.length > 256) {
        failed.push({ input, reason: "Invalid address" });
        continue;
      }
      if (existingAddresses.has(address)) {
        failed.push({ input, reason: `Address '${address}' already exists` });
        continue;
      }
      try {
        const robot = await this.create(solutionId, input);
        succeeded.push(robot);
        existingAddresses.add(address);
      } catch (err) {
        failed.push({ input, reason: (err as Error).message });
      }
    }

    return { succeeded, failed };
  }

  async list(solutionId: string, options?: RobotListOptions): Promise<RobotDefinition[]> {
    const resources = await this.obs.list(`v1/solutions/${solutionId}/robots`);
    const robots: RobotDefinition[] = [];

    for (const res of resources) {
      if (res.type === "file" && res.name !== "_keep") {
        const robot = await this.obs.getJson<RobotDefinition>(
          `v1/solutions/${solutionId}/robots/${res.name}`
        );
        if (robot) {
          robots.push(robot);
        }
      }
    }

    let filtered = robots;
    if (options?.filter) {
      const f = options.filter;
      filtered = filtered.filter((r) => {
        if (f.alias && !r.alias.toLowerCase().includes(f.alias.toLowerCase())) return false;
        if (f.address && !r.address.toLowerCase().includes(f.address.toLowerCase())) return false;
        if (f.model && !r.model.toLowerCase().includes(f.model.toLowerCase())) return false;
        if (f.robotSN && !r.robotSN.toLowerCase().includes(f.robotSN.toLowerCase())) return false;
        return true;
      });
    }

    const sortField = options?.sort?.field ?? "createdAt";
    const sortOrder = options?.sort?.order ?? "desc";
    filtered.sort((a, b) => {
      const va = a[sortField];
      const vb = b[sortField];
      const cmp = va < vb ? -1 : va > vb ? 1 : 0;
      return sortOrder === "asc" ? cmp : -cmp;
    });

    return filtered;
  }

  async get(solutionId: string, robotId: string): Promise<RobotDefinition | null> {
    if (!SAFE_ID_RE.test(robotId)) {
      throw new InvalidRobotIdError(robotId);
    }
    return this.obs.getJson<RobotDefinition>(`v1/solutions/${solutionId}/robots/${robotId}`);
  }

  async update(
    solutionId: string,
    robotId: string,
    patch: Partial<Omit<RobotDefinition, "id" | "createdAt">>
  ): Promise<RobotDefinition> {
    if (!SAFE_ID_RE.test(robotId)) {
      throw new InvalidRobotIdError(robotId);
    }

    const current = await this.get(solutionId, robotId);
    if (!current) {
      throw new RobotNotFoundError(robotId);
    }

    const updated: RobotDefinition = {
      ...current,
      ...patch,
      id: current.id,
      createdAt: current.createdAt,
      updatedAt: new Date().toISOString(),
    };

    await this.obs.putJson(`v1/solutions/${solutionId}/robots/${robotId}`, updated);
    return updated;
  }

  async remove(solutionId: string, robotId: string): Promise<void> {
    if (!SAFE_ID_RE.test(robotId)) {
      throw new InvalidRobotIdError(robotId);
    }
    await this.obs.deletePath(`v1/solutions/${solutionId}/robots/${robotId}`);
  }

  async removeBatch(
    solutionId: string,
    robotIds: string[]
  ): Promise<{ succeeded: string[]; failed: { robotId: string; reason: string }[] }> {
    const succeeded: string[] = [];
    const failed: { robotId: string; reason: string }[] = [];

    for (const robotId of robotIds) {
      try {
        await this.remove(solutionId, robotId);
        succeeded.push(robotId);
      } catch (err) {
        failed.push({ robotId, reason: (err as Error).message });
      }
    }

    return { succeeded, failed };
  }
}
