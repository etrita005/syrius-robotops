import type { ValueMap } from "flowed";
import { SshCommandTask, type SshCommandParams } from "./sshCommandTask.js";

const INSTALL_COMMAND = "adb install -d /home/developer/app_package.apk";

export class InstallAppTask extends SshCommandTask {
  protected override buildParams(params: ValueMap): SshCommandParams {
    return super.buildParams({
      ...params,
      sudo: false,
      commandTimeout: (params.commandTimeout as number) ?? 300000,
    });
  }

  protected override getSshCommand(_params: ValueMap): string {
    return INSTALL_COMMAND;
  }
}
