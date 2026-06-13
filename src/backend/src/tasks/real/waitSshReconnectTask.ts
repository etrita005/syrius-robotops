import type { ValueMap } from "flowed";
import { BaseTask } from "../baseTask.js";
import { WaitSshConnectedTask } from "./waitSshConnectedTask.js";
import { WaitSshDisconnectedTask } from "./waitSshDisconnectedTask.js";

export class WaitSshReconnectTask extends BaseTask {
  private readonly disconnectedTask = new WaitSshDisconnectedTask();
  private readonly connectedTask = new WaitSshConnectedTask();

  protected override async onExec(params: ValueMap, context?: ValueMap): Promise<ValueMap> {
    const startedAt = Date.now();
    const timeout = params.timeout as number | undefined;
    const ignoreFailure = (params.ignoreFailure as boolean) ?? false;

    try {
      const disconnectResult = await this.disconnectedTask.exec(params, context);
      if (disconnectResult.success === false) {
        return this.handleFailure(ignoreFailure, startedAt, "SSH disconnection phase failed", disconnectResult);
      }

      const connectParams = this.buildConnectParams(params, timeout, startedAt);
      const connectResult = await this.connectedTask.exec(connectParams, context);
      if (connectResult.success === false) {
        return this.handleFailure(ignoreFailure, startedAt, "SSH connection phase failed", disconnectResult, connectResult);
      }

      return {
        done: true,
        success: true,
        state: "connected",
        disconnectResult,
        connectResult,
        elapsedMs: Date.now() - startedAt,
      };
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      if (ignoreFailure) {
        this.log.warn({ err: error.message, elapsedMs: Date.now() - startedAt }, "SSH reconnect failed (ignored)");
        return {
          done: true,
          success: false,
          state: "unknown",
          elapsedMs: Date.now() - startedAt,
          error: error.message,
        };
      }
      throw error;
    }
  }

  private buildConnectParams(params: ValueMap, timeout: number | undefined, startedAt: number): ValueMap {
    if (timeout === undefined) return params;

    const remainingMs = timeout - (Date.now() - startedAt);
    if (remainingMs <= 0) {
      return { ...params, timeout: 0 };
    }

    return { ...params, timeout: remainingMs };
  }

  private handleFailure(
    ignoreFailure: boolean,
    startedAt: number,
    message: string,
    disconnectResult?: ValueMap,
    connectResult?: ValueMap
  ): ValueMap {
    if (ignoreFailure) {
      this.log.warn({ elapsedMs: Date.now() - startedAt, message }, "SSH reconnect phase failed (ignored)");
      return {
        done: true,
        success: false,
        state: (connectResult?.state as string | undefined) ?? (disconnectResult?.state as string | undefined) ?? "unknown",
        disconnectResult,
        connectResult,
        elapsedMs: Date.now() - startedAt,
        error: message,
      };
    }

    throw new Error(message);
  }
}
