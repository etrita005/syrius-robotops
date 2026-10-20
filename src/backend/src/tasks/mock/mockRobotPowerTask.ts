import type { ValueMap } from "flowed";
import { RobotPowerTask } from "../real/robotPowerTask.js";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class MockRobotPowerTask extends RobotPowerTask {
  protected override async onExec(params: ValueMap): Promise<ValueMap> {
    const powerAction = params.powerAction;

    this.log.info({ powerAction }, "Simulating robot power action (mock)");

    await sleep(1000);

    this.log.info({ powerAction }, "Power action completed (mock)");

    return {
      done: true,
      success: true,
      stdout: "",
      stderr: "",
      exitCode: 0,
    };
  }
}
