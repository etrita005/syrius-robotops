import type { ValueMap } from "flowed";
import { SshCommandTask, type SshCommandParams } from "./sshCommandTask.js";

export class ApplyAlpha2MapTask extends SshCommandTask {
  protected override buildParams(params: ValueMap): SshCommandParams {
    return super.buildParams({
      ...params,
      sudo: true,
      commandTimeout: (params.commandTimeout as number) ?? 60000,
    });
  }

  protected override getSshCommand(_params: ValueMap): string {
    return [
      "rm -rf /opt/cosmos/map/ws/*",
      "unzip -o /tmp/alpha2_map_package.zip -d /opt/cosmos/map/ws",
      "chown -R pivot:pivot /opt/cosmos/map/",
      "systemctl restart marie.service",
    ].join(" && ");
  }
}
