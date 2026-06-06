import type { ValueMap } from "flowed";
import { SshCommandTask, type SshCommandParams } from "./sshCommandTask.js";

const UPGRADE_MOVEBASE_COMMAND =
  "unzip /mnt/sdcard/offlineota/alpha2_movebase_offline_package.zip -d /mnt/sdcard/offlineota && " +
  "/mnt/sdcard/offlineota/alpha2_movebase_offline_package/install_offline.sh";

export class UpgradeMovebaseTask extends SshCommandTask {
  protected override buildParams(params: ValueMap): SshCommandParams {
    return super.buildParams({ ...params, sudo: true });
  }

  protected override getSshCommand(_params: ValueMap): string {
    return UPGRADE_MOVEBASE_COMMAND;
  }
}
