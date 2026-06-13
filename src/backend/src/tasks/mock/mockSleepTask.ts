import type { ValueMap } from "flowed";
import { SleepTask } from "../real/sleepTask.js";
import { createLogger } from "../../logger/index.js";

const log = createLogger("Sleep");

export class MockSleepTask extends SleepTask {
  override async exec(params: ValueMap): Promise<ValueMap> {
    const sleepMs = (params.sleepMs as number) ?? 0;
    log.info({ sleepMs }, 'Simulating sleep (mock)');
    return { done: true, success: true };
  }
}
