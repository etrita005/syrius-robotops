import type { ValueMap } from "flowed";
import { TransferAlgorithmConfigTask } from "../real/transferAlgorithmConfigTask.js";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class MockTransferAlgorithmConfigTask extends TransferAlgorithmConfigTask {
  protected override async onExec(params: ValueMap, _context?: ValueMap): Promise<ValueMap> {
    const artifactId = params.artifactId as string | undefined;

    this.log.info({ artifactId }, 'Simulating algorithm config file transfer (mock)');

    await sleep(3000);

    this.log.info('Transfer completed (mock)');

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
