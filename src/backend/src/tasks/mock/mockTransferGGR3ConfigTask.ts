import type { ValueMap } from "flowed";
import { TransferGGR3ConfigTask } from "../real/transferGGR3ConfigTask.js";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class MockTransferGGR3ConfigTask extends TransferGGR3ConfigTask {
  protected override async onExec(params: ValueMap, _context?: ValueMap): Promise<ValueMap> {
    const artifactId = params.artifactId as string | undefined;

    this.log.info({ artifactId }, 'Simulating GGR3 config file transfer (mock)');

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
