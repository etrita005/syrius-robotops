import type { ValueMap } from "flowed";
import { StartAppServiceTask } from "../real/startAppServiceTask.js";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class MockStartAppServiceTask extends StartAppServiceTask {
  protected override async onExec(params: ValueMap): Promise<ValueMap> {
    this.log.info("Simulating start service (mock)");
    await sleep(1000);
    this.log.info("Service started (mock)");
    return {
      done: true,
      success: true,
      stdout: "",
      stderr: "",
      exitCode: 0,
    };
  }
}
