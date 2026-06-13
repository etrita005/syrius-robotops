import type { ValueMap } from "flowed";
import { BaseTask } from "../baseTask.js";

export class SleepTask extends BaseTask {
  protected override async onExec(params: ValueMap): Promise<ValueMap> {
    const sleepMs = (params.sleepMs as number) ?? 0;
    this.log.info({ sleepMs }, 'Sleeping');
    await new Promise((resolve) => setTimeout(resolve, sleepMs));
    this.log.info('Sleep completed');
    return { done: true, success: true };
  }
}
