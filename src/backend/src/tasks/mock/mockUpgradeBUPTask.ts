import type { ValueMap } from "flowed";
import { UpgradeBUPTask } from "../real/upgradeBUPTask.js";
import { createLogger } from "../../logger/index.js";

const log = createLogger("UpgradeBUP");

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class MockUpgradeBUPTask extends UpgradeBUPTask {
  override async exec(_params: ValueMap): Promise<ValueMap> {
    log.info('Simulating upgrade (mock)');

    await sleep(5000);

    log.info('Upgrade completed (mock)');

    return {
      done: true,
      success: true,
      stdout: "",
      stderr: "",
      exitCode: 0,
    };
  }
}
