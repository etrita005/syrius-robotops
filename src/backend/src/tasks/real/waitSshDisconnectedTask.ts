import type { ITaskResolver, ValueMap } from "flowed";
import { buildSshConnectionWaitParams, waitForSshConnectionState } from "./sshConnectionWait.js";

export class WaitSshDisconnectedTask implements ITaskResolver {
  async exec(params: ValueMap): Promise<ValueMap> {
    return waitForSshConnectionState(
      buildSshConnectionWaitParams(params),
      "disconnected",
      "WaitSshDisconnected"
    );
  }
}
