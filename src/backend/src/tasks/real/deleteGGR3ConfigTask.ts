import type { ValueMap } from "flowed";
import { SshCommandTask, type SshCommandParams } from "./sshCommandTask.js";

const CLEANUP_COMMAND = "rm -rf /tmp/ggr3_config /tmp/ggr3_config.zip";

export class DeleteGGR3ConfigTask extends SshCommandTask {
  protected override buildParams(params: ValueMap): SshCommandParams {
    return super.buildParams({ ...params, sudo: true });
  }

  protected override getSshCommand(_params: ValueMap): string {
    return CLEANUP_COMMAND;
  }
}
