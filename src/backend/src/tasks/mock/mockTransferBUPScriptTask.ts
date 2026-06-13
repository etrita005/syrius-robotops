import type { ValueMap } from "flowed";
import { TransferBUPScriptTask } from "../real/transferBUPScriptTask.js";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class MockTransferBUPScriptTask extends TransferBUPScriptTask {
  protected override async onExec(params: ValueMap, _context?: ValueMap): Promise<ValueMap> {
    const transferParams = this.buildParams(params);

    this.log.info({ localFilePath: transferParams.localFilePath, remoteFilePath: transferParams.remoteFilePath }, 'Simulating BUP script transfer (mock)');

    await sleep(2000);

    this.log.info('BUP script transfer completed (mock)');

    return {
      done: true,
      success: true,
      bytesTransferred: 0,
      localChecksum: "",
      remoteChecksum: "",
      integrityVerified: true,
    };
  }
}
