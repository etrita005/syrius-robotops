import type { ValueMap } from "flowed";
import { StopAppServiceTask } from "../real/stopAppServiceTask.js";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class MockStopAppServiceTask extends StopAppServiceTask {
  protected override async onExec(params: ValueMap): Promise<ValueMap> {
    this.log.info("Simulating stop service (mock)");
    await sleep(1000);
    this.log.info("Service stopped (mock)");
    return {
      done: true,
      success: true,
      stdout: "",
      stderr: "",
      exitCode: 0,
    };
  }
}
