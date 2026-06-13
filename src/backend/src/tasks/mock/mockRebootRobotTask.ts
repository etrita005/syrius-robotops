import type { ValueMap } from "flowed";
import { RebootRobotTask } from "../real/rebootRobotTask.js";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class MockRebootRobotTask extends RebootRobotTask {
  protected override async onExec(params: ValueMap): Promise<ValueMap> {
    const bootWaitMs = this.getBootWaitMs(params);

    if (bootWaitMs > 0) {
      this.log.info({ bootWaitMs }, "Waiting before reboot (mock)");
      await sleep(bootWaitMs);
    }

    this.log.info("Simulating robot reboot (mock)");

    await sleep(5000);

    this.log.info("Reboot completed (mock)");

    return {
      done: true,
      success: true,
      stdout: "",
      stderr: "",
      exitCode: 0,
    };
  }
}
