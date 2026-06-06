import type { ValueMap } from "flowed";
import { SshCommandTask, type SshCommandParams } from "./sshCommandTask.js";

const DELETE_MOVEBASE_COMMAND = "rm -rf /mnt/sdcard/offlineota";

export class DeleteMovebaseTask extends SshCommandTask {
  protected override buildParams(params: ValueMap): SshCommandParams {
    return super.buildParams({ ...params, sudo: true });
  }

  protected override getSshCommand(_params: ValueMap): string {
    return DELETE_MOVEBASE_COMMAND;
  }
}
