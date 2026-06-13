import type { ValueMap } from "flowed";
import { SshFileTransferTask, type SshFileTransferParams } from "./sshFileTransferTask.js";
import { join } from "node:path";

const SCRIPT_PATH = join(__dirname, "..", "..", "..", "res", "upgrade_bup.sh");
const REMOTE_SCRIPT_PATH = "/tmp/upgrade_bup.sh";

export class TransferBUPScriptTask extends SshFileTransferTask {
  protected override buildParams(params: ValueMap): SshFileTransferParams {
    return {
      ...super.buildParams({
        ...params,
        sudo: true,
        verifyChecksum: false,
        retryCount: 1,
      }),
      localFilePath: SCRIPT_PATH,
      remoteFilePath: REMOTE_SCRIPT_PATH,
    };
  }

  protected override async onExec(params: ValueMap, context?: ValueMap): Promise<ValueMap> {
    this.log.info({ localFilePath: SCRIPT_PATH, remoteFilePath: REMOTE_SCRIPT_PATH }, 'Transferring upgrade_bup.sh');
    return super.onExec(params, context);
  }
}
