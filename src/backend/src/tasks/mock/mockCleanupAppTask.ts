import type { ValueMap } from "flowed";
import { CleanupAppTask } from "../real/cleanupAppTask.js";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class MockCleanupAppTask extends CleanupAppTask {
  protected override async onExec(_params: ValueMap): Promise<ValueMap> {
    this.log.info("Simulating cleanup (mock)");
    await sleep(500);
    return {
      done: true,
      success: true,
      stdout: "",
      stderr: "",
      exitCode: 0,
    };
  }
}
