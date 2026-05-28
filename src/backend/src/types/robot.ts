export interface HardwareDeviceNode {
  name: string;
  firmwareVersion: string;
  hardwareVersion: string;
  serialNumber: string;
  hardwareId: string;
  parentName?: string;
  online: boolean;
}

export interface RobotDefinition {
  id: string;
  address: string;
  addressType: "ip" | "mdns";
  alias: string;
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
  createdAt: string;
  updatedAt: string;
}

export interface CreateRobotInput {
  address: string;
  alias?: string;
}

export interface RobotListOptions {
  filter?: {
    alias?: string;
    address?: string;
    model?: string;
    robotSN?: string;
  };
  sort?: {
    field: "alias" | "address" | "model" | "robotSN" | "createdAt";
    order: "asc" | "desc";
  };
}
