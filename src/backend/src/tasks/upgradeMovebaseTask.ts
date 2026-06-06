import type { ValueMap } from "flowed";
import { SshCommandTask } from "./sshCommandTask.js";

const UPGRADE_MOVEBASE_COMMAND =
  "unzip alpha2_movebase_offline_package.zip -d /mnt/sdcard/offlineota && " +
  "sudo -S -p '' /mnt/sdcard/offlineota/alpha2_movebase_offline_package/install_offline.sh";

export class UpgradeMovebaseTask extends SshCommandTask {
  protected override getSshCommand(params: ValueMap): string {
    const sshPassword = params.sshPassword as string | undefined;
    if (!sshPassword) {
      throw new Error("[UpgradeMovebase] 'sshPassword' is required for sudo authentication");
    }
    return this.wrapWithSudoPassword(UPGRADE_MOVEBASE_COMMAND, sshPassword);
  }
}
