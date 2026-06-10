import type { ValueMap } from "flowed";
import { SshCommandTask, type SshCommandParams } from "./sshCommandTask.js";

const UPGRADE_BUP_COMMAND = 
  "rm -rf /mnt/sdcard/bup_offlineota/bup_offline_package-* && " +
  "unzip -o /mnt/sdcard/bup_offlineota/bup_offline_package.zip -d /mnt/sdcard/bup_offlineota && " +
  "/mnt/sdcard/bup_offlineota/bup_offline_package-*/upgrade_bup.sh";

export class UpgradeBUPTask extends SshCommandTask {
  protected override buildParams(params: ValueMap): SshCommandParams {
    return super.buildParams({
      ...params,
      sudo: true,
      commandTimeout: (params.commandTimeout as number) ?? 900000,
    });
  }

  protected override getSshCommand(_params: ValueMap): string {
    return UPGRADE_BUP_COMMAND;
  }
}
