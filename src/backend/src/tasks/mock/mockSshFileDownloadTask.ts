import type { ValueMap } from "flowed";
import { SshFileDownloadTask } from "../real/sshFileDownloadTask.js";
import { posix as pathPosix } from "node:path";
import { join as pathJoin } from "node:path";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class MockSshFileDownloadTask extends SshFileDownloadTask {
  protected override async onExec(params: ValueMap): Promise<ValueMap> {
    const downloadParams = this.buildParams(params);

    const fileName = pathPosix.basename(downloadParams.remoteFilePath);
    const localFilePath = pathJoin(downloadParams.localTargetDir, fileName);

    this.log.info({ remoteFilePath: downloadParams.remoteFilePath, localTargetDir: downloadParams.localTargetDir }, 'Simulating file download (mock)');

    await sleep(5000);

    this.log.info({ localFilePath }, 'Download completed (mock)');

    return {
      done: true,
      success: true,
      bytesTransferred: 0,
      localFilePath,
      localChecksum: "",
      remoteChecksum: "",
      integrityVerified: true,
    };
  }
}
