import type { ValueMap } from "flowed";
import { SshCommandTask, type SshCommandParams } from "./sshCommandTask.js";

const INSTALL_COMMAND = [
  "systemctl stop cosmos-update-engine.service || true",
  "sleep 3",
  "rm -f /var/lib/dpkg/lock*",
  "FORCE_UPDATE=1 dpkg -i /tmp/dragonball3_package.deb",
].join(" && ");

export class InstallDragonball3Task extends SshCommandTask {
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
