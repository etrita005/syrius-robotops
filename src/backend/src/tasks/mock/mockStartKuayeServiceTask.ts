import type { ValueMap } from "flowed";
import { StartKuayeServiceTask } from "../real/startKuayeServiceTask.js";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class MockStartKuayeServiceTask extends StartKuayeServiceTask {
  protected override async onExec(params: ValueMap): Promise<ValueMap> {
    const command = this.getSshCommand(params);

    this.log.info({ command }, 'Simulating start service (mock)');

    await sleep(2000);

    this.log.info('Service started (mock)');

    return {
      done: true,
      success: true,
      stdout: "",
      stderr: "",
      exitCode: 0,
    };
  }
}
