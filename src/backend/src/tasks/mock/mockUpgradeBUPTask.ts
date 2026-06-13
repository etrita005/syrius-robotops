import type { ValueMap } from "flowed";
import { UpgradeBUPTask } from "../real/upgradeBUPTask.js";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class MockUpgradeBUPTask extends UpgradeBUPTask {
  protected override async onExec(_params: ValueMap): Promise<ValueMap> {
    this.log.info('Simulating upgrade (mock)');

    await sleep(5000);

    this.log.info('Upgrade completed (mock)');

    return {
      done: true,
      success: true,
      stdout: "",
      stderr: "",
      exitCode: 0,
    };
  }
}
