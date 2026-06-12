import type { ValueMap } from "flowed";
import { SshFileTransferTask, type SshFileTransferParams } from "./sshFileTransferTask.js";
import { join } from "node:path";
import { createLogger } from "../../logger/index.js";

const log = createLogger("TransferBUPScript");

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

  override async exec(params: ValueMap, _context?: ValueMap): Promise<ValueMap> {
    log.info({ localFilePath: SCRIPT_PATH, remoteFilePath: REMOTE_SCRIPT_PATH }, 'Transferring upgrade_bup.sh');
    return super.exec(params);
  }
}
