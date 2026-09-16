import type { ValueMap } from "flowed";
import { UpdateAlgorithmConfigTask } from "../real/updateAlgorithmConfigTask.js";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class MockUpdateAlgorithmConfigTask extends UpdateAlgorithmConfigTask {
  protected override async onExec(_params: ValueMap): Promise<ValueMap> {
    this.log.info('Simulating algorithm config update (mock)');

    await sleep(5000);

    this.log.info('Algorithm config update completed (mock)');

    return {
      done: true,
      success: true,
      stdout: "",
      stderr: "",
      exitCode: 0,
    };
  }
}
