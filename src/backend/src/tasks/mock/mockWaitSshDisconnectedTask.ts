import type { ValueMap } from "flowed";
import { WaitSshDisconnectedTask } from "../real/waitSshDisconnectedTask.js";

export class MockWaitSshDisconnectedTask extends WaitSshDisconnectedTask {
  protected override async onExec(_params: ValueMap): Promise<ValueMap> {
    return {
      done: true,
      success: true,
      state: "disconnected",
      attempts: 1,
      elapsedMs: 0,
    };
  }
}
