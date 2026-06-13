import type { ValueMap } from "flowed";
import { BaseTask } from "../baseTask.js";
import { MockWaitSshConnectedTask } from "./mockWaitSshConnectedTask.js";
import { MockWaitSshDisconnectedTask } from "./mockWaitSshDisconnectedTask.js";

export class MockWaitSshReconnectTask extends BaseTask {
  private readonly disconnectedTask = new MockWaitSshDisconnectedTask();
  private readonly connectedTask = new MockWaitSshConnectedTask();

  protected override async onExec(params: ValueMap, context?: ValueMap): Promise<ValueMap> {
    const disconnectResult = await this.disconnectedTask.exec(params, context);
    const connectResult = await this.connectedTask.exec(params, context);

    return {
      done: true,
      success: true,
      state: "connected",
      disconnectResult,
      connectResult,
      elapsedMs: 0,
    };
  }
}
