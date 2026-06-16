import type { ValueMap } from "flowed";
import { InstallGGRTask } from "../real/installGGRTask.js";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class MockInstallGGRTask extends InstallGGRTask {
  protected override async onExec(params: ValueMap): Promise<ValueMap> {
    const command = this.getSshCommand(params);

    this.log.info({ command }, 'Simulating adb install (mock)');

    await sleep(5000);

    this.log.info('Install completed (mock)');

    return {
      done: true,
      success: true,
      stdout: "Success",
      stderr: "",
      exitCode: 0,
    };
  }
}
