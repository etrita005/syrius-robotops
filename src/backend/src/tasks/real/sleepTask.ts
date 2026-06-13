import type { ValueMap, ITaskResolver } from "flowed";
import { createLogger } from "../../logger/index.js";

const log = createLogger("Sleep");

export class SleepTask implements ITaskResolver {
  async exec(params: ValueMap): Promise<ValueMap> {
    const sleepMs = (params.sleepMs as number) ?? 0;
    log.info({ sleepMs }, 'Sleeping');
    await new Promise((resolve) => setTimeout(resolve, sleepMs));
    log.info('Sleep completed');
    return { done: true, success: true };
  }
}
