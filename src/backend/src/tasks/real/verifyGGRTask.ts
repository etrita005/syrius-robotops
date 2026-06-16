import type { ValueMap } from "flowed";
import { SshCommandTask, type SshCommandParams } from "./sshCommandTask.js";

const VERIFY_COMMAND =
  "adb shell dumpsys package com.syriusrobotics.platform.launcher | grep versionName | sed 's/ *versionName=//'";

export class VerifyGGRTask extends SshCommandTask {
  protected override buildParams(params: ValueMap): SshCommandParams {
    return super.buildParams({
      ...params,
      sudo: false,
      commandTimeout: (params.commandTimeout as number) ?? 30000,
    });
  }

  protected override getSshCommand(_params: ValueMap): string {
    return VERIFY_COMMAND;
  }
}
