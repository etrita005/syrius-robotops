import type { ValueMap } from "flowed";
import { SshFileTransferTask } from "./sshFileTransferTask.js";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class MockSshFileTransferTask extends SshFileTransferTask {
  async exec(params: ValueMap): Promise<ValueMap> {
    const transferParams = this.buildParams(params);

    console.log(
      `[SshFileTransfer:Mock] Simulating file transfer: ${transferParams.localFilePath} -> ${transferParams.remoteFilePath}`
    );

    await sleep(5000);

    console.log(
      `[SshFileTransfer:Mock] Transfer completed (mock)`
    );

    return {
      success: true,
      bytesTransferred: 0,
      localChecksum: "",
      remoteChecksum: "",
      integrityVerified: true,
    };
  }
}
