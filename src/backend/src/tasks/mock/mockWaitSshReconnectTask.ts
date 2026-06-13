import type { ITaskResolver, ValueMap } from "flowed";
import { MockWaitSshConnectedTask } from "./mockWaitSshConnectedTask.js";
import { MockWaitSshDisconnectedTask } from "./mockWaitSshDisconnectedTask.js";

export class MockWaitSshReconnectTask implements ITaskResolver {
  private readonly disconnectedTask = new MockWaitSshDisconnectedTask();
  private readonly connectedTask = new MockWaitSshConnectedTask();

  async exec(params: ValueMap): Promise<ValueMap> {
    const disconnectResult = await this.disconnectedTask.exec(params);
    const connectResult = await this.connectedTask.exec(params);

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
