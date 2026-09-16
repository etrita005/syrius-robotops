import type { ValueMap } from "flowed";
import { DeleteAlgorithmConfigTask } from "../real/deleteAlgorithmConfigTask.js";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class MockDeleteAlgorithmConfigTask extends DeleteAlgorithmConfigTask {
  protected override async onExec(_params: ValueMap): Promise<ValueMap> {
    this.log.info('Simulating algorithm config package cleanup (mock)');

    await sleep(1000);

    this.log.info('Cleanup completed (mock)');

    return {
      done: true,
      success: true,
      stdout: "",
      stderr: "",
      exitCode: 0,
    };
  }
}
