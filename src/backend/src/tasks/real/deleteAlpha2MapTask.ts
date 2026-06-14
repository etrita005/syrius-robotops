import type { ValueMap } from "flowed";
import { SshCommandTask, type SshCommandParams } from "./sshCommandTask.js";

const DELETE_ALPHA2_MAP_COMMAND = "rm -rf /tmp/alpha2_map_package.zip";

export class DeleteAlpha2MapTask extends SshCommandTask {
  protected override buildParams(params: ValueMap): SshCommandParams {
    return super.buildParams({ ...params, sudo: true });
  }

  protected override getSshCommand(_params: ValueMap): string {
    return DELETE_ALPHA2_MAP_COMMAND;
  }
}
