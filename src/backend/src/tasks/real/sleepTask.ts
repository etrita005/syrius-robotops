import type { ValueMap, ITaskResolver } from "flowed";
import { createLogger } from "../../logger/index.js";

const log = createLogger("Sleep");

export class SleepTask implements ITaskResolver {
  async exec(params: ValueMap): Promise<ValueMap> {
    const sleepSeconds = (params.sleepSeconds as number) ?? 0;
    log.info({ sleepSeconds }, 'Sleeping');
    await new Promise((resolve) => setTimeout(resolve, sleepSeconds * 1000));
    log.info('Sleep completed');
    return { done: true, success: true };
  }
}
