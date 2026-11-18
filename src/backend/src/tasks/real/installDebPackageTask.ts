import type { ValueMap } from "flowed";
import { SshCommandTask, type SshCommandParams } from "./sshCommandTask.js";

const INSTALL_COMMAND = `sh -c '
PACKAGE_NAME=$(dpkg-deb -f /tmp/install_deb_package.deb Package) || exit 1
apt-mark manual "$PACKAGE_NAME" || true
DEBIAN_FRONTEND=noninteractive dpkg -i --force-confold /tmp/install_deb_package.deb
INSTALL_RC=$?
if [ "$INSTALL_RC" -eq 0 ]; then apt-mark manual "$PACKAGE_NAME" || true; fi
rm -f /tmp/install_deb_package.deb
exit "$INSTALL_RC"
'`;

export class InstallDebPackageTask extends SshCommandTask {
  protected override buildParams(params: ValueMap): SshCommandParams {
    return super.buildParams({
      ...params,
      sudo: true,
      retryCount: 1,
      commandTimeout: (params.commandTimeout as number) ?? 300000,
    });
  }

  protected override getSshCommand(_params: ValueMap): string {
    return INSTALL_COMMAND;
  }
}
