import type { ValueMap } from "flowed";
import { DeleteAppTask } from "../real/deleteAppTask.js";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class MockDeleteAppTask extends DeleteAppTask {
  protected override async onExec(params: ValueMap): Promise<ValueMap> {
    this.log.info("Simulating delete app package (mock)");
    await sleep(500);
    this.log.info("App package deleted (mock)");
    return {
      done: true,
      success: true,
      stdout: "",
      stderr: "",
      exitCode: 0,
    };
  }
}
