import type { ValueMap } from "flowed";
import { SshCommandTask, type SshCommandParams } from "./sshCommandTask.js";

export class UpgradeBUPTask extends SshCommandTask {
  protected override buildParams(params: ValueMap): SshCommandParams {
    return super.buildParams({
      ...params,
      sudo: true,
      commandTimeout: (params.commandTimeout as number) ?? 900000,
    });
  }

  protected override getSshCommand(_params: ValueMap): string {
    return [
      "rm -rf /mnt/sdcard/bup_offlineota/bup_offline_package",
      "mkdir -p /mnt/sdcard/bup_offlineota/bup_offline_package",
      "tar xvf /mnt/sdcard/bup_offlineota/bup_offline_package.tar.gz -C /mnt/sdcard/bup_offlineota/bup_offline_package",
      "sh -c 'if [ ! -f /etc/l4t_jurassic_release -a -f /etc/jurassic_release ]; then cp /etc/jurassic_release /etc/l4t_jurassic_release; elif [ ! -f /etc/jurassic_release -a -f /etc/l4t_jurassic_release ]; then cp /etc/l4t_jurassic_release /etc/jurassic_release; fi'",
      "mv /tmp/upgrade_bup.sh /mnt/sdcard/bup_offlineota/bup_offline_package/ota/deploy/upgrade_bup.sh",
      "chmod +x /mnt/sdcard/bup_offlineota/bup_offline_package/ota/deploy/*.sh",
      "/mnt/sdcard/bup_offlineota/bup_offline_package/ota/deploy/upgrade_bup.sh /mnt/sdcard/bup_offlineota/bup_offline_package/ota",
    ].join(" && ");
  }
}
