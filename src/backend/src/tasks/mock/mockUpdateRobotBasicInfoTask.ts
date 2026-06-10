import type { ValueMap } from "flowed";
import { UpdateRobotBasicInfoTask } from "../real/updateRobotBasicInfoTask.js";
import { createLogger } from "../../logger/index.js";

const log = createLogger("UpdateRobotBasicInfo");

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class MockUpdateRobotBasicInfoTask extends UpdateRobotBasicInfoTask {
  override async exec(params: ValueMap, context?: ValueMap): Promise<ValueMap> {
    log.info({ cacheKey: params.cacheKey }, 'Simulating robot info update (mock)');

    await sleep(500);

    log.info('Update completed (mock)');

    return super.exec(params, context);
  }
}
