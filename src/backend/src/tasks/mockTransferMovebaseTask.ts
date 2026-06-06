import type { ValueMap } from "flowed";
import { TransferMovebaseTask } from "./transferMovebaseTask.js";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class MockTransferMovebaseTask extends TransferMovebaseTask {
  override async exec(params: ValueMap, _context?: ValueMap): Promise<ValueMap> {
    const artifactId = params.artifactId as string | undefined;

    console.log(
      `[TransferMovebase:Mock] Simulating file transfer${artifactId ? ` for artifact ${artifactId}` : ""}`
    );

    await sleep(3000);

    console.log(
      `[TransferMovebase:Mock] Transfer completed (mock)`
    );

    return {
      success: true,
      bytesTransferred: 0,
      localChecksum: "",
      remoteChecksum: "",
      integrityVerified: true,
    };
  }
}
