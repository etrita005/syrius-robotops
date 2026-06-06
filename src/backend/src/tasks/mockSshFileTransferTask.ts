import type { ValueMap } from "flowed";
import { SshFileTransferTask } from "./sshFileTransferTask.js";
import { createLogger } from "../logger/index.js";

const log = createLogger("SshFileTransfer");

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class MockSshFileTransferTask extends SshFileTransferTask {
  async exec(params: ValueMap): Promise<ValueMap> {
    const transferParams = this.buildParams(params);

    log.info({ localFilePath: transferParams.localFilePath, remoteFilePath: transferParams.remoteFilePath }, 'Simulating file transfer (mock)');

    await sleep(5000);

    log.info('Transfer completed (mock)');

    return {
      success: true,
      bytesTransferred: 0,
      localChecksum: "",
      remoteChecksum: "",
      integrityVerified: true,
    };
  }
}
