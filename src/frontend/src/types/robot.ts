export interface HardwareDeviceNode {
  name: string;
  firmwareVersion: string;
  hardwareVersion: string;
  serialNumber: string;
  hardwareId: string;
  parentName?: string;
  online: boolean;
}

export interface StoredRobotData {
  id: string;
  address: string;
  addressType: "ip" | "mdns";
  alias: string;
  port: number;
  createdAt: string;
  updatedAt: string;
}

export interface RobotDefinition extends StoredRobotData {
  model: string;
  robotSN: string;
  thingsId: string;
  vendorId: string;
  productId: string;
  mainboardSN: string;
  mainboardId: string;
  mainSOMSN: string;
  megaCosmOSVersion: string;
  movebaseVersion: string;
  ggrVersion: string;
  mcuFirmwareVersions: Record<string, string>;
  actuatorFirmwareVersions: Record<string, string>;
  sensorFirmwareVersions: Record<string, string>;
  mainControlHardwareVersion: string;
  mcuHardwareVersions: Record<string, string>;
  actuatorHardwareVersions: Record<string, string>;
  sensorHardwareVersions: Record<string, string>;
  hardwareDeviceTree: HardwareDeviceNode[];
}

export interface CreateRobotInput {
  address: string;
  alias?: string;
}

export interface RobotBasicInfoResponse {
  model: string;
  robotSn: string;
  thingsId: string;
  vendorId: string;
  productId: string;
  mainBoardSn: string;
  mainBoardId: string;
  mainSomSn: string;
}

export interface RobotWithBasicInfoResponse extends StoredRobotData {
  basicInfo: RobotBasicInfoResponse | null;
  basicInfoFetchedAt: string | null;
}

export interface ParsedAddress {
  host: string;
  port: number;
  addressType: "ip" | "mdns";
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

function isMdns(host: string): boolean {
  return !/^(\d{1,3}\.){3}\d{1,3}$/.test(host);
}

const DEFAULT_PORT = 22;

export function parseAddressInput(input: string): ParsedAddress | null {
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
    return { host, port, addressType: isMdns(host) ? "mdns" : "ip" };
  }

  if (lastColon === 0) return null;

  return { host: trimmed, port: DEFAULT_PORT, addressType: isMdns(trimmed) ? "mdns" : "ip" };
}

export function formatAddressDisplay(host: string, port: number): string {
  return `${host}:${port}`;
}

export function generateMockRobotInfo(address: string, alias: string): Omit<RobotDefinition, keyof StoredRobotData> {
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
    model,
    robotSN: randSN("SN"),
    thingsId: randSN("THING"),
    vendorId: "SYRIUS",
    productId: `${model}-STD`,
    mainboardSN: randSN("MB-SN"),
    mainboardId: randSN("MB-ID"),
    mainSOMSN: randSN("SOM-SN"),
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

export function enrichRobot(stored: StoredRobotData): RobotDefinition {
  const mockInfo = generateMockRobotInfo(stored.address, stored.alias);
  return { ...stored, ...mockInfo };
}

export function enrichRobotFromBackend(robot: RobotWithBasicInfoResponse): RobotDefinition {
  const mockInfo = generateMockRobotInfo(robot.address, robot.alias);
  return {
    ...robot,
    model: robot.basicInfo?.model ?? mockInfo.model,
    robotSN: robot.basicInfo?.robotSn ?? mockInfo.robotSN,
    thingsId: robot.basicInfo?.thingsId ?? mockInfo.thingsId,
    vendorId: robot.basicInfo?.vendorId ?? mockInfo.vendorId,
    productId: robot.basicInfo?.productId ?? mockInfo.productId,
    mainboardSN: robot.basicInfo?.mainBoardSn ?? mockInfo.mainboardSN,
    mainboardId: robot.basicInfo?.mainBoardId ?? mockInfo.mainboardId,
    mainSOMSN: robot.basicInfo?.mainSomSn ?? mockInfo.mainSOMSN,
    megaCosmOSVersion: mockInfo.megaCosmOSVersion,
    movebaseVersion: mockInfo.movebaseVersion,
    ggrVersion: mockInfo.ggrVersion,
    mcuFirmwareVersions: mockInfo.mcuFirmwareVersions,
    actuatorFirmwareVersions: mockInfo.actuatorFirmwareVersions,
    sensorFirmwareVersions: mockInfo.sensorFirmwareVersions,
    mainControlHardwareVersion: mockInfo.mainControlHardwareVersion,
    mcuHardwareVersions: mockInfo.mcuHardwareVersions,
    actuatorHardwareVersions: mockInfo.actuatorHardwareVersions,
    sensorHardwareVersions: mockInfo.sensorHardwareVersions,
    hardwareDeviceTree: mockInfo.hardwareDeviceTree,
  };
}

export function createStoredRobotData(input: CreateRobotInput, id: string): StoredRobotData {
  const parsed = parseAddressInput(input.address);
  if (!parsed) {
    throw new Error("Invalid address format. Expected <IP>:<port> or <mDNS>:<port> (port defaults to 22).");
  }
  const alias = input.alias?.trim() || parsed.host;
  const now = new Date().toISOString();
  return {
    id,
    address: parsed.host,
    addressType: parsed.addressType,
    alias,
    port: parsed.port,
    createdAt: now,
    updatedAt: now,
  };
}

export function generateRobotId(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let id = "";
  for (let i = 0; i < 6; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return `robot-${id}`;
}
