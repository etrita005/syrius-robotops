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
  online: boolean;
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

export interface RobotSoftwareInfoResponse {
  movebaseVersion: string;
  minimalSystemVersion: string;
  l4tVersion: string;
}

export interface RobotWithBasicInfoResponse extends StoredRobotData {
  basicInfo: RobotBasicInfoResponse | null;
  softwareInfo: RobotSoftwareInfoResponse | null;
  basicInfoFetchedAt: string | null;
}

export interface ParsedAddress {
  host: string;
  port: number;
  addressType: "ip" | "mdns";
}

const DEFAULT_PORT = 22;

function isMdns(host: string): boolean {
  return !/^(\d{1,3}\.){3}\d{1,3}$/.test(host);
}

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

const PLACEHOLDER = "...";

export function formatInfoValue(value: string | undefined | null): string {
  if (value === undefined || value === null || value === "") {
    return PLACEHOLDER;
  }
  return value;
}

const EMPTY_DEVICE_TREE: HardwareDeviceNode[] = [];
const EMPTY_VERSION_MAP: Record<string, string> = {};

export function enrichRobot(stored: StoredRobotData): RobotDefinition {
  return {
    ...stored,
    online: false,
    model: PLACEHOLDER,
    robotSN: PLACEHOLDER,
    thingsId: PLACEHOLDER,
    vendorId: PLACEHOLDER,
    productId: PLACEHOLDER,
    mainboardSN: PLACEHOLDER,
    mainboardId: PLACEHOLDER,
    mainSOMSN: PLACEHOLDER,
    megaCosmOSVersion: PLACEHOLDER,
    movebaseVersion: PLACEHOLDER,
    ggrVersion: PLACEHOLDER,
    mcuFirmwareVersions: EMPTY_VERSION_MAP,
    actuatorFirmwareVersions: EMPTY_VERSION_MAP,
    sensorFirmwareVersions: EMPTY_VERSION_MAP,
    mainControlHardwareVersion: PLACEHOLDER,
    mcuHardwareVersions: EMPTY_VERSION_MAP,
    actuatorHardwareVersions: EMPTY_VERSION_MAP,
    sensorHardwareVersions: EMPTY_VERSION_MAP,
    hardwareDeviceTree: EMPTY_DEVICE_TREE,
  };
}

export function enrichRobotFromBackend(robot: RobotWithBasicInfoResponse): RobotDefinition {
  return {
    ...robot,
    online: robot.basicInfo !== null,
    model: robot.basicInfo?.model ?? PLACEHOLDER,
    robotSN: robot.basicInfo?.robotSn ?? PLACEHOLDER,
    thingsId: robot.basicInfo?.thingsId ?? PLACEHOLDER,
    vendorId: robot.basicInfo?.vendorId ?? PLACEHOLDER,
    productId: robot.basicInfo?.productId ?? PLACEHOLDER,
    mainboardSN: robot.basicInfo?.mainBoardSn ?? PLACEHOLDER,
    mainboardId: robot.basicInfo?.mainBoardId ?? PLACEHOLDER,
    mainSOMSN: robot.basicInfo?.mainSomSn ?? PLACEHOLDER,
    movebaseVersion: robot.softwareInfo?.movebaseVersion ?? PLACEHOLDER,
    megaCosmOSVersion: robot.softwareInfo?.minimalSystemVersion ?? PLACEHOLDER,
    ggrVersion: robot.softwareInfo?.l4tVersion ?? PLACEHOLDER,
    mcuFirmwareVersions: EMPTY_VERSION_MAP,
    actuatorFirmwareVersions: EMPTY_VERSION_MAP,
    sensorFirmwareVersions: EMPTY_VERSION_MAP,
    mainControlHardwareVersion: PLACEHOLDER,
    mcuHardwareVersions: EMPTY_VERSION_MAP,
    actuatorHardwareVersions: EMPTY_VERSION_MAP,
    sensorHardwareVersions: EMPTY_VERSION_MAP,
    hardwareDeviceTree: EMPTY_DEVICE_TREE,
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
