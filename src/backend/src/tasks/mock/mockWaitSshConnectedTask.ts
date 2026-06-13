import type { ValueMap } from "flowed";
import { WaitSshConnectedTask } from "../real/waitSshConnectedTask.js";

export class MockWaitSshConnectedTask extends WaitSshConnectedTask {
  override async exec(_params: ValueMap): Promise<ValueMap> {
    return {
      done: true,
      success: true,
      state: "connected",
      attempts: 1,
      elapsedMs: 0,
    };
  }
}
