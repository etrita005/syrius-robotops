import type { ValueMap } from "flowed";
import { InstallAppTask } from "../real/installAppTask.js";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class MockInstallAppTask extends InstallAppTask {
  protected override async onExec(params: ValueMap): Promise<ValueMap> {
    const command = this.getSshCommand(params);

    this.log.info({ command }, "Simulating adb install (mock)");

    await sleep(5000);

    this.log.info("Install completed (mock)");

    return {
      done: true,
      success: true,
      stdout: "Success",
      stderr: "",
      exitCode: 0,
    };
  }
}
