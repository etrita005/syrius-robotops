import type { ValueMap } from "flowed";
import { TransferAlpha2MapTask } from "../real/transferAlpha2MapTask.js";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class MockTransferAlpha2MapTask extends TransferAlpha2MapTask {
  protected override async onExec(params: ValueMap, _context?: ValueMap): Promise<ValueMap> {
    const artifactId = params.artifactId as string | undefined;

    this.log.info({ artifactId }, 'Simulating Alpha2 map file transfer (mock)');

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
