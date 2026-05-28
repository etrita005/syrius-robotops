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
  mainSOMId: string;
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

function isMdns(address: string): boolean {
  return !/^(\d{1,3}\.){3}\d{1,3}$/.test(address);
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

export function enrichRobot(stored: StoredRobotData): RobotDefinition {
  const mockInfo = generateMockRobotInfo(stored.address, stored.alias);
  return { ...stored, ...mockInfo };
}

export function createStoredRobotData(input: CreateRobotInput, id: string): StoredRobotData {
  const address = input.address.trim();
  const alias = input.alias?.trim() || address;
  const now = new Date().toISOString();
  return {
    id,
    address,
    addressType: isMdns(address) ? "mdns" : "ip",
    alias,
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
