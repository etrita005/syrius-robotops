import type { ValueMap } from "flowed";
import { RebootRobotTask } from "../real/rebootRobotTask.js";
import { createLogger } from "../../logger/index.js";

const log = createLogger("RebootRobot");

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class MockRebootRobotTask extends RebootRobotTask {
  override async exec(params: ValueMap): Promise<ValueMap> {
    const bootWaitMs = this.getBootWaitMs(params);

    if (bootWaitMs > 0) {
      log.info({ bootWaitMs }, "Waiting before reboot (mock)");
      await sleep(bootWaitMs);
    }

    log.info("Simulating robot reboot (mock)");

    await sleep(5000);

    log.info("Reboot completed (mock)");

    return {
      done: true,
      success: true,
      stdout: "",
      stderr: "",
      exitCode: 0,
    };
  }
}
