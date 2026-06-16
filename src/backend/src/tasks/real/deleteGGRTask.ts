import type { ValueMap } from "flowed";
import { SshCommandTask, type SshCommandParams } from "./sshCommandTask.js";

const DELETE_GGR_COMMAND = "rm -f /home/developer/ggr_package.apk";

export class DeleteGGRTask extends SshCommandTask {
  protected override buildParams(params: ValueMap): SshCommandParams {
    return super.buildParams({ ...params, sudo: true });
  }

  protected override getSshCommand(_params: ValueMap): string {
    return DELETE_GGR_COMMAND;
  }
}
