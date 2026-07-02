import type { ValueMap } from "flowed";
import { SshCommandTask, type SshCommandParams } from "./sshCommandTask.js";

const UNINSTALL_COMMAND = "dpkg --purge l4t-downloader";

export class UninstallL4TDownloaderTask extends SshCommandTask {
  protected override buildParams(params: ValueMap): SshCommandParams {
    return super.buildParams({
      ...params,
      sudo: true,
      retryCount: 1,
      commandTimeout: (params.commandTimeout as number) ?? 60000,
    });
  }

  protected override getSshCommand(_params: ValueMap): string {
    return UNINSTALL_COMMAND;
  }
}
