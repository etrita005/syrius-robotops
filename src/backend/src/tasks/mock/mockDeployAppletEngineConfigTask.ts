import type { ValueMap } from "flowed";
import { DeployAppletEngineConfigTask } from "../real/deployAppletEngineConfigTask.js";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class MockDeployAppletEngineConfigTask extends DeployAppletEngineConfigTask {
  protected override async onExec(_params: ValueMap): Promise<ValueMap> {
    this.log.info('Simulating AppletEngine config deploy (mock)');

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
