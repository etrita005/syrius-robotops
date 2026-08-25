import type { ValueMap } from "flowed";
import { SshCommandTask, type SshCommandParams } from "./sshCommandTask.js";

export class UpgradeMovebaseTask extends SshCommandTask {
  protected override buildParams(params: ValueMap): SshCommandParams {
    return super.buildParams({
      ...params,
      sudo: true,
      commandTimeout: (params.commandTimeout as number) ?? 900000,
    });
  }

  protected override getSshCommand(_params: ValueMap): string {
    return [
      "rm -rf /mnt/sdcard/offlineota/alpha2_movebase_offline_package-*",
      "unzip -o /mnt/sdcard/offlineota/alpha2_movebase_offline_package.zip -d /mnt/sdcard/offlineota",
      "/mnt/sdcard/offlineota/alpha2_movebase_offline_package-*/install_offline.sh",
    ].join(" && ");
  }

  protected override async onExec(params: ValueMap, context?: ValueMap): Promise<ValueMap> {
    const host = (params.robotMdnsDomain as string) ?? (params.robotIp as string);
    const port = (params.robotPort as number) ?? 22;

    this.log.info(
      { host, port, commandTimeout: (params.commandTimeout as number) ?? 900000 },
      "UpgradeMovebase: starting — remove old package, unzip offline package, run install_offline.sh"
    );

    try {
      const result = await super.onExec(params, context);
      this.log.info(
        { host, port, exitCode: result.exitCode },
        "UpgradeMovebase: succeeded"
      );
      return result;
    } catch (err) {
      this.log.error(
        { host, port, err: err instanceof Error ? err.message : String(err) },
        "UpgradeMovebase: installation failed"
      );
      throw err;
    }
  }
}
