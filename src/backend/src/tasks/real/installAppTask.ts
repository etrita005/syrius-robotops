import type { ValueMap } from "flowed";
import { SshCommandTask, type SshCommandParams } from "./sshCommandTask.js";

const INSTALL_COMMAND = [
  "rm -rf ~/.android/ || true",
  "adb kill-server || true",
  "adb start-server || true",
  "systemctl stop syriusrobotics.kuaye.service || true",
  "adb install -d -r /tmp/app_package.apk",
  "systemctl start syriusrobotics.kuaye.service || true",
  "rm -f /tmp/app_package.apk || true",
].join(" && ");

export class InstallAppTask extends SshCommandTask {
  protected override buildParams(params: ValueMap): SshCommandParams {
    return super.buildParams({
      ...params,
      sudo: true,
      commandTimeout: (params.commandTimeout as number) ?? 300000,
    });
  }

  protected override getSshCommand(_params: ValueMap): string {
    return INSTALL_COMMAND;
  }
}
