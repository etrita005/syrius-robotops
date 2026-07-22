export const LICENSE_KEY_LICENSES = "clear-janitor-licenses";
export const LICENSE_KEY_TYPE = "clear-janitor-license-type";
export const LICENSE_KEY_AUTH_START = "clear-janitor-license-authorization-start-time";

export type LicenseType = "None" | "Trial" | "Formal";

export const VALID_LICENSE_TYPES: LicenseType[] = ["None", "Trial", "Formal"];

export interface LicenseConfig {
  [LICENSE_KEY_LICENSES]: string;
  [LICENSE_KEY_TYPE]: LicenseType;
  [LICENSE_KEY_AUTH_START]: string;
}

export interface ConnectRequest {
  robotIp: string;
  robotPort?: number;
}

export interface ConnectResponse {
  connected: true;
  robotIp: string;
  robotPort: number;
  config: LicenseConfig;
}

export interface SessionResponse {
  connected: boolean;
  robotIp?: string;
  robotPort?: number;
}

export interface ReadResponse {
  config: LicenseConfig;
}

export interface ApplyRequest {
  config: LicenseConfig;
}

export interface ApplyResponse {
  applied: true;
}

export type ConnectionStatus = "disconnected" | "connecting" | "connected" | "busy";

export interface LicenseTestUiState {
  status: ConnectionStatus;
  robotIp: string;
  robotPort: number;
  config: LicenseConfig;
  lastError: string | null;
  lastOutput: string | null;
}
