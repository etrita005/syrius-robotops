import type { ValueMap } from "flowed";
import { ApplyAlpha2MapTask } from "../real/applyAlpha2MapTask.js";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class MockApplyAlpha2MapTask extends ApplyAlpha2MapTask {
  protected override async onExec(_params: ValueMap): Promise<ValueMap> {
    this.log.info('Simulating Alpha2 map apply (mock)');

    await sleep(5000);

    this.log.info('Map apply completed (mock)');

    return {
      done: true,
      success: true,
      stdout: "",
      stderr: "",
      exitCode: 0,
    };
  }
}
