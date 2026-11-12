import type { ValueMap } from "flowed";
import { SshCommandTask, type SshCommandParams } from "./sshCommandTask.js";

/**
 * The install script lives inside the uploaded zip. `cd` is executed inside
 * `sh -c` on purpose: SshCommandTask wraps every `&&` segment with sudo, and
 * `sudo cd` is not valid. The inner separator is `;` so the command is not
 * split into a separate sudo segment.
 */
const INSTALL_COMMAND = [
  "systemctl stop cosmos-update-engine.service",
  "sleep 6",
  "rm -rf /tmp/ota",
  "unzip -o /tmp/booster.zip -d /tmp/ota",
  "sh -c 'cd /tmp/ota; ./install_booster.sh'",
].join(" && ");

export class InstallBoosterTask extends SshCommandTask {
  protected override buildParams(params: ValueMap): SshCommandParams {
    return super.buildParams({
      ...params,
      sudo: true,
      commandTimeout: (params.commandTimeout as number) ?? 900000,
    });
  }

  protected override getSshCommand(_params: ValueMap): string {
    return INSTALL_COMMAND;
  }
}
