import type { ValueMap } from "flowed";
import { SshFileTransferTask, type SshFileTransferParams } from "./sshFileTransferTask.js";

const REMOTE_TARGET_PATH = "/mnt/sdcard/offlineota/alpha2_movebase_offline_package.zip";

export class TransferMovebaseTask extends SshFileTransferTask {
  protected override buildParams(params: ValueMap): SshFileTransferParams {
    return {
      ...super.buildParams(params),
      remoteFilePath: REMOTE_TARGET_PATH,
    };
  }
}
