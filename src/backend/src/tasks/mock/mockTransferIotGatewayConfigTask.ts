import type { ValueMap } from "flowed";
import { TransferIotGatewayConfigTask } from "../real/transferIotGatewayConfigTask.js";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class MockTransferIotGatewayConfigTask extends TransferIotGatewayConfigTask {
  protected override async onExec(params: ValueMap, _context?: ValueMap): Promise<ValueMap> {
    const transferParams = this.buildParams(params);

    this.log.info({ localFilePath: transferParams.localFilePath, remoteFilePath: transferParams.remoteFilePath }, 'Simulating iot-gateway config transfer (mock)');

    await sleep(2000);

    this.log.info('Iot-gateway config transfer completed (mock)');

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
