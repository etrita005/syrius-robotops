import type { ValueMap } from "flowed";
import { InstallBoosterTask } from "../real/installBoosterTask.js";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class MockInstallBoosterTask extends InstallBoosterTask {
  protected override async onExec(_params: ValueMap): Promise<ValueMap> {
    this.log.info("Simulating booster installation (mock)");

    await sleep(5000);

    this.log.info("Booster installation completed (mock)");

    return {
      done: true,
      success: true,
      stdout: "Booster minimal system installed (mock).",
      stderr: "",
      exitCode: 0,
    };
  }
}
