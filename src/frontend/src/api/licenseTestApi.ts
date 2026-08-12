import { post, get } from "./client.js";
import type {
  ConnectResponse,
  SessionResponse,
  ReadResponse,
  ApplyResponse,
  LicenseConfig,
} from "../types/licenseTest.js";

const BASE = "/license-test";

export async function connect(robotIp: string, robotPort: number): Promise<ConnectResponse> {
  return post<ConnectResponse>(`${BASE}/connect`, { robotIp, robotPort });
}

export async function disconnect(): Promise<{ connected: false }> {
  return post<{ connected: false }>(`${BASE}/disconnect`);
}

export async function getSession(): Promise<SessionResponse> {
  return get<SessionResponse>(`${BASE}/session`);
}

export async function readConfig(): Promise<ReadResponse> {
  return post<ReadResponse>(`${BASE}/read`);
}

export async function applyConfig(config: LicenseConfig): Promise<ApplyResponse> {
  return post<ApplyResponse>(`${BASE}/apply`, { config });
}
