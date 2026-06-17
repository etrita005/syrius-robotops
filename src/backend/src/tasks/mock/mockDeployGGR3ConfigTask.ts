import type { ValueMap } from "flowed";
import { DeployGGR3ConfigTask } from "../real/deployGGR3ConfigTask.js";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class MockDeployGGR3ConfigTask extends DeployGGR3ConfigTask {
  protected override async onExec(_params: ValueMap): Promise<ValueMap> {
    this.log.info('Simulating GGR3 config deploy (mock)');

    await sleep(5000);

    this.log.info('Deploy completed (mock)');

    return {
      done: true,
      success: true,
      stdout: "",
      stderr: "",
      exitCode: 0,
    };
  }
}
