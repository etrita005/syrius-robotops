import type { ValueMap } from "flowed";
import { TransferDragonball3Task } from "../real/transferDragonball3Task.js";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class MockTransferDragonball3Task extends TransferDragonball3Task {
  protected override async onExec(params: ValueMap, _context?: ValueMap): Promise<ValueMap> {
    const artifactId = params.artifactId as string | undefined;

    this.log.info({ artifactId }, "Simulating dragonball3 file transfer (mock)");

    await sleep(1000);

    this.log.info("Dragonball3 transfer completed (mock)");

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
