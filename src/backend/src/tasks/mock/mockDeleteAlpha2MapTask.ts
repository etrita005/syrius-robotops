import type { ValueMap } from "flowed";
import { DeleteAlpha2MapTask } from "../real/deleteAlpha2MapTask.js";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class MockDeleteAlpha2MapTask extends DeleteAlpha2MapTask {
  protected override async onExec(_params: ValueMap): Promise<ValueMap> {
    this.log.info('Simulating Alpha2 map package cleanup (mock)');

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
