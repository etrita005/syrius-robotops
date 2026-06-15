import type { ValueMap } from "flowed";
import { UpdateIotGatewayConfigTask } from "../real/updateIotGatewayConfigTask.js";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class MockUpdateIotGatewayConfigTask extends UpdateIotGatewayConfigTask {
  protected override async onExec(_params: ValueMap): Promise<ValueMap> {
    this.log.info('Simulating iot-gateway config update (mock)');

    await sleep(3000);

    this.log.info('Iot-gateway config update completed (mock)');

    return {
      done: true,
      success: true,
      stdout: "",
      stderr: "",
      exitCode: 0,
    };
  }
}
