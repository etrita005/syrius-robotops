import type { ValueMap } from "flowed";
import { SshCommandTask, type SshCommandParams } from "./sshCommandTask.js";

const CLEANUP_COMMAND = "rm -f /tmp/algorithm_config_package.zip";

export class DeleteAlgorithmConfigTask extends SshCommandTask {
  protected override buildParams(params: ValueMap): SshCommandParams {
    return super.buildParams({ ...params, sudo: true });
  }

  protected override getSshCommand(_params: ValueMap): string {
    return CLEANUP_COMMAND;
  }
}
