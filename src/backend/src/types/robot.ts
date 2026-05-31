export interface StoredRobotData {
  id: string;
  address: string;
  addressType: "ip" | "mdns";
  alias: string;
  port: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateRobotInput {
  address: string;
  alias?: string;
}

export interface ParsedAddress {
  host: string;
  port: number;
  addressType: "ip" | "mdns";
}
