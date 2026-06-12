import type { ValueMap } from "flowed";
import { SshCommandTask, type SshCommandParams } from "./sshCommandTask.js";

const UPGRADE_BUP_COMMAND = 
  "rm -rf /mnt/sdcard/bup_offlineota/bup_offline_package && " +
  "mkdir -p /mnt/sdcard/bup_offlineota/bup_offline_package && " +
  "tar xvf /mnt/sdcard/bup_offlineota/bup_offline_package.tar.gz -C /mnt/sdcard/bup_offlineota/bup_offline_package && " +
  "[ -f /etc/l4t_jurassic_release ] && ln -sf /etc/l4t_jurassic_release /etc/jurassic_release || true && " +
  "chmod +x /mnt/sdcard/bup_offlineota/bup_offline_package/ota/deploy/upgrade_bup.sh && " +
  "/mnt/sdcard/bup_offlineota/bup_offline_package/ota/deploy/upgrade_bup.sh /mnt/sdcard/bup_offlineota/bup_offline_package/ota";

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
