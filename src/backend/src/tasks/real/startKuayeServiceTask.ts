import type { ValueMap } from "flowed";
import { SshCommandTask, type SshCommandParams } from "./sshCommandTask.js";

const START_SERVICE_COMMAND = "systemctl start syriusrobotics.kuaye.service";

export class StartKuayeServiceTask extends SshCommandTask {
  protected override buildParams(params: ValueMap): SshCommandParams {
    return super.buildParams({ ...params, sudo: true });
  }

  protected override getSshCommand(_params: ValueMap): string {
    return START_SERVICE_COMMAND;
  }
}
