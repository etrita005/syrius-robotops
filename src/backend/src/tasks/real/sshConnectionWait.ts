import type { ValueMap } from "flowed";
import { Client } from "ssh2";
import { SSH_PASSWORD, SSH_USERNAME } from "../../config.js";
import { createLogger } from "../../logger/index.js";

const DEFAULT_SSH_PORT = 22;
const DEFAULT_POLL_INTERVAL_MS = 1000;
const DEFAULT_CONNECT_TIMEOUT_MS = 5000;

export type SshConnectionState = "connected" | "disconnected" | "unknown";
export type SshConnectionTargetState = "connected" | "disconnected";

export interface SshConnectionWaitParams {
  robotIp: string;
  robotPort: number;
  robotMdnsDomain?: string;
  sshUsername: string;
  sshPassword: string;
  timeout?: number;
  ignoreFailure: boolean;
  pollIntervalMs: number;
  connectTimeoutMs: number;
}

export interface SshConnectionProbeParams {
  host: string;
  port: number;
  username: string;
  password: string;
  connectTimeoutMs: number;
}

export interface SshConnectionProbeResult {
  connected: boolean;
  error?: string;
}

export interface SshConnectionWaitResult extends ValueMap {
  done: true;
  success: boolean;
  state: SshConnectionState;
  attempts: number;
  elapsedMs: number;
  error?: string;
}

export type SshConnectionProbe = (
  params: SshConnectionProbeParams
) => Promise<SshConnectionProbeResult>;

const log = createLogger("SshConnectionWait");
let sshConnectionProbe: SshConnectionProbe = defaultSshConnectionProbe;

export function setSshConnectionProbeForTest(probe: SshConnectionProbe): void {
  sshConnectionProbe = probe;
}

export function resetSshConnectionProbeForTest(): void {
  sshConnectionProbe = defaultSshConnectionProbe;
}

export function buildSshConnectionWaitParams(params: ValueMap): SshConnectionWaitParams {
  return {
    robotIp: params.robotIp as string,
    robotPort: (params.robotPort as number) ?? DEFAULT_SSH_PORT,
    robotMdnsDomain: params.robotMdnsDomain as string | undefined,
    sshUsername: (params.sshUsername as string) ?? SSH_USERNAME,
    sshPassword: (params.sshPassword as string) ?? SSH_PASSWORD,
    timeout: params.timeout as number | undefined,
    ignoreFailure: (params.ignoreFailure as boolean) ?? false,
    pollIntervalMs: (params.pollIntervalMs as number) ?? DEFAULT_POLL_INTERVAL_MS,
    connectTimeoutMs: (params.connectTimeoutMs as number) ?? DEFAULT_CONNECT_TIMEOUT_MS,
  };
}

export function resolveSshConnectionHost(params: SshConnectionWaitParams): string {
  return params.robotMdnsDomain ?? params.robotIp;
}

export async function waitForSshConnectionState(
  params: SshConnectionWaitParams,
  targetState: SshConnectionTargetState,
  moduleName: string
): Promise<SshConnectionWaitResult> {
  const host = resolveSshConnectionHost(params);
  const startedAt = Date.now();
  let attempts = 0;
  let state: SshConnectionState = "unknown";
  let lastError: string | undefined;

  log.info({ host, port: params.robotPort, username: params.sshUsername, targetState, module: moduleName }, "Waiting for SSH state");

  while (true) {
    const elapsedBeforeProbe = Date.now() - startedAt;
    const remainingMs = params.timeout === undefined ? undefined : params.timeout - elapsedBeforeProbe;

    if (remainingMs !== undefined && remainingMs <= 0) {
      return handleWaitFailure(params, targetState, state, attempts, Date.now() - startedAt, lastError);
    }

    attempts += 1;
    const connectTimeoutMs = remainingMs === undefined
      ? params.connectTimeoutMs
      : Math.max(1, Math.min(params.connectTimeoutMs, remainingMs));

    const probeResult = await sshConnectionProbe({
      host,
      port: params.robotPort,
      username: params.sshUsername,
      password: params.sshPassword,
      connectTimeoutMs,
    });

    state = probeResult.connected ? "connected" : "disconnected";
    lastError = probeResult.error;

    log.debug({ host, port: params.robotPort, attempt: attempts, state, targetState, elapsedMs: Date.now() - startedAt }, "SSH probe completed");

    if (state === targetState) {
      return {
        done: true,
        success: true,
        state,
        attempts,
        elapsedMs: Date.now() - startedAt,
      };
    }

    const elapsedAfterProbe = Date.now() - startedAt;
    const nextRemainingMs = params.timeout === undefined ? undefined : params.timeout - elapsedAfterProbe;

    if (nextRemainingMs !== undefined && nextRemainingMs <= 0) {
      return handleWaitFailure(params, targetState, state, attempts, elapsedAfterProbe, lastError);
    }

    const sleepMs = nextRemainingMs === undefined
      ? params.pollIntervalMs
      : Math.min(params.pollIntervalMs, nextRemainingMs);

    await sleep(sleepMs);
  }
}

function defaultSshConnectionProbe(params: SshConnectionProbeParams): Promise<SshConnectionProbeResult> {
  return new Promise((resolve) => {
    const conn = new Client();
    let settled = false;

    const finish = (result: SshConnectionProbeResult): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      conn.end();
      resolve(result);
    };

    const timer = setTimeout(() => {
      finish({ connected: false, error: `SSH connection timed out after ${params.connectTimeoutMs}ms` });
    }, params.connectTimeoutMs);

    conn
      .on("ready", () => {
        finish({ connected: true });
      })
      .on("error", (err: Error) => {
        finish({ connected: false, error: err.message });
      })
      .on("close", () => {
        finish({ connected: false, error: "SSH connection closed" });
      })
      .connect({
        host: params.host,
        port: params.port,
        username: params.username,
        password: params.password,
        readyTimeout: params.connectTimeoutMs,
      });
  });
}

function handleWaitFailure(
  params: SshConnectionWaitParams,
  targetState: SshConnectionTargetState,
  state: SshConnectionState,
  attempts: number,
  elapsedMs: number,
  lastError?: string
): SshConnectionWaitResult {
  const message = `Timed out waiting for SSH ${targetState}`;

  if (params.ignoreFailure) {
    log.warn({ attempts, elapsedMs, state, targetState, err: lastError }, "SSH wait failed (ignored)");
    return {
      done: true,
      success: false,
      state,
      attempts,
      elapsedMs,
      error: lastError ? `${message}: ${lastError}` : message,
    };
  }

  throw new Error(lastError ? `${message}: ${lastError}` : message);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
