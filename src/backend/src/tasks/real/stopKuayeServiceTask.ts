import type { ValueMap } from "flowed";
import { SshCommandTask, type SshCommandParams } from "./sshCommandTask.js";

const STOP_SERVICE_COMMAND = "systemctl stop syriusrobotics.kuaye.service";

export class StopKuayeServiceTask extends SshCommandTask {
  protected override buildParams(params: ValueMap): SshCommandParams {
    return super.buildParams({ ...params, sudo: true });
  }

  protected override getSshCommand(_params: ValueMap): string {
    return STOP_SERVICE_COMMAND;
  }
}
