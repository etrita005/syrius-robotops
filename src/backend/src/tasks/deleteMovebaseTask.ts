import type { ValueMap } from "flowed";
import { SshCommandTask } from "./sshCommandTask.js";

const DELETE_MOVEBASE_COMMAND = "rm -rf /mnt/sdcard/offlineota";

export class DeleteMovebaseTask extends SshCommandTask {
  protected override getSshCommand(_params: ValueMap): string {
    return DELETE_MOVEBASE_COMMAND;
  }
}
