import type { ValueMap } from "flowed";
import { DeleteBUPTask } from "../real/deleteBUPTask.js";
import { createLogger } from "../../logger/index.js";

const log = createLogger("DeleteBUP");

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class MockDeleteBUPTask extends DeleteBUPTask {
  override async exec(_params: ValueMap): Promise<ValueMap> {
    log.info("Simulating cleanup (mock)");

    await sleep(1000);

    log.info("Cleanup completed (mock)");

    return {
      done: true,
      success: true,
      stdout: "",
      stderr: "",
      exitCode: 0,
    };
  }
}
