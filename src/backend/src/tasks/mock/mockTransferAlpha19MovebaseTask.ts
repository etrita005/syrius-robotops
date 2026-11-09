import type { ValueMap } from "flowed";
import { TransferAlpha19MovebaseTask } from "../real/transferAlpha19MovebaseTask.js";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class MockTransferAlpha19MovebaseTask extends TransferAlpha19MovebaseTask {
  protected override async onExec(params: ValueMap, _context?: ValueMap): Promise<ValueMap> {
    const artifactId = params.artifactId as string | undefined;

    this.log.info({ artifactId }, "Simulating alpha1.9 movebase file transfer (mock)");

    await sleep(1000);

    this.log.info("Alpha1.9 movebase transfer completed (mock)");

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
