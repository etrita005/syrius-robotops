import type { ValueMap } from "flowed";
import { TransferDebPackageTask } from "../real/transferDebPackageTask.js";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class MockTransferDebPackageTask extends TransferDebPackageTask {
  protected override async onExec(params: ValueMap, _context?: ValueMap): Promise<ValueMap> {
    const artifactId = params.artifactId as string | undefined;

    this.log.info({ artifactId }, "Simulating deb package file transfer (mock)");

    await sleep(1000);

    this.log.info("Deb package transfer completed (mock)");

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
