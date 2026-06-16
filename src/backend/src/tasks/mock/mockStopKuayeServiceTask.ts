import type { ValueMap } from "flowed";
import { StopKuayeServiceTask } from "../real/stopKuayeServiceTask.js";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class MockStopKuayeServiceTask extends StopKuayeServiceTask {
  protected override async onExec(params: ValueMap): Promise<ValueMap> {
    const command = this.getSshCommand(params);

    this.log.info({ command }, 'Simulating stop service (mock)');

    await sleep(2000);

    this.log.info('Service stopped (mock)');

    return {
      done: true,
      success: true,
      stdout: "",
      stderr: "",
      exitCode: 0,
    };
  }
}
