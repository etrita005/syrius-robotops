import type { ValueMap } from "flowed";
import { MovebaseDiskCleanupTask } from "../real/movebaseDiskCleanupTask.js";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class MockMovebaseDiskCleanupTask extends MovebaseDiskCleanupTask {
  protected override async onExec(params: ValueMap): Promise<ValueMap> {
    const cleanUserHomes = params.cleanUserHomes === true || params.cleanUserHomes === "true";

    this.log.info({ cleanUserHomes }, "Simulating Movebase disk cleanup");

    await sleep(1000);

    this.log.info("Movebase disk cleanup completed");

    return {
      done: true,
      success: true,
      stdout: "Disk cleanup completed (mock)",
      stderr: "",
      exitCode: 0,
    };
  }
}
