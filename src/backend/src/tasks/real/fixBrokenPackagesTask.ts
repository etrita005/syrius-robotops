import type { ValueMap } from "flowed";
import { SshCommandTask, type SshCommandParams } from "./sshCommandTask.js";

const FIX_COMMAND = [
  "systemctl stop cosmos-update-engine.service || true",
  "sleep 3",
  "rm -f /var/lib/dpkg/lock*",
  "dpkg --configure -a",
  "DEBIAN_FRONTEND=noninteractive apt -o Dpkg::Options::=--force-overwrite -o Dir::Etc=/opt/cosmos/var/cosmos_update_engine/apt --allow-downgrades --fix-broken install -y",
].join(" && ");

export class FixBrokenPackagesTask extends SshCommandTask {
  protected override buildParams(params: ValueMap): SshCommandParams {
    return super.buildParams({
      ...params,
      sudo: true,
      retryCount: 1,
      commandTimeout: (params.commandTimeout as number) ?? 120000,
    });
  }

  protected override getSshCommand(_params: ValueMap): string {
    return FIX_COMMAND;
  }
}
