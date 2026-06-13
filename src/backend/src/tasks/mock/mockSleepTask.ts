import type { ValueMap } from "flowed";
import { SleepTask } from "../real/sleepTask.js";

export class MockSleepTask extends SleepTask {
  protected override async onExec(params: ValueMap): Promise<ValueMap> {
    const sleepMs = (params.sleepMs as number) ?? 0;
    this.log.info({ sleepMs }, 'Simulating sleep (mock)');
    return { done: true, success: true };
  }
}
