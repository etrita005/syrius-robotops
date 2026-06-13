import type { ValueMap } from "flowed";
import { SshFileTransferTask } from "../real/sshFileTransferTask.js";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class MockSshFileTransferTask extends SshFileTransferTask {
  protected override async onExec(params: ValueMap): Promise<ValueMap> {
    const transferParams = this.buildParams(params);

    this.log.info({ localFilePath: transferParams.localFilePath, remoteFilePath: transferParams.remoteFilePath }, 'Simulating file transfer (mock)');

    await sleep(5000);

    this.log.info('Transfer completed (mock)');

    return {
      success: true,
      bytesTransferred: 0,
      localChecksum: "",
      remoteChecksum: "",
      integrityVerified: true,
    };
  }
}
