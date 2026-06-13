import type { ValueMap } from "flowed";
import { BaseTask } from "../baseTask.js";
import { buildSshConnectionWaitParams, waitForSshConnectionState } from "./sshConnectionWait.js";

export class WaitSshDisconnectedTask extends BaseTask {
  protected override async onExec(params: ValueMap): Promise<ValueMap> {
    return waitForSshConnectionState(
      buildSshConnectionWaitParams(params),
      "disconnected",
      "WaitSshDisconnected"
    );
  }
}
