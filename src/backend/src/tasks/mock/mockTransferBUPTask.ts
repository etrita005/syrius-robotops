import type { ValueMap } from "flowed";
import { TransferBUPTask } from "../real/transferBUPTask.js";
import { createLogger } from "../../logger/index.js";

const log = createLogger("TransferBUP");

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class MockTransferBUPTask extends TransferBUPTask {
  override async exec(params: ValueMap, _context?: ValueMap): Promise<ValueMap> {
    const artifactId = params.artifactId as string | undefined;

    log.info({ artifactId }, 'Simulating file transfer (mock)');

    await sleep(3000);

    log.info('Transfer completed (mock)');

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
