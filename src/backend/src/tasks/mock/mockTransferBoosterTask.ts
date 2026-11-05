import type { ValueMap } from "flowed";
import { TransferBoosterTask } from "../real/transferBoosterTask.js";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class MockTransferBoosterTask extends TransferBoosterTask {
  protected override async onExec(params: ValueMap, _context?: ValueMap): Promise<ValueMap> {
    const artifactId = params.artifactId as string | undefined;

    this.log.info({ artifactId }, "Simulating booster file transfer (mock)");

    await sleep(1000);

    this.log.info("Booster transfer completed (mock)");

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
