import type { ValueMap } from "flowed";
import { CleanupDebPackageTask } from "../real/cleanupDebPackageTask.js";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class MockCleanupDebPackageTask extends CleanupDebPackageTask {
  protected override async onExec(_params: ValueMap): Promise<ValueMap> {
    this.log.info("Simulating deb package cleanup (mock)");

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
