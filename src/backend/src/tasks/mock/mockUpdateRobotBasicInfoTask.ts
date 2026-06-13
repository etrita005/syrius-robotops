import type { ValueMap } from "flowed";
import { UpdateRobotBasicInfoTask } from "../real/updateRobotBasicInfoTask.js";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class MockUpdateRobotBasicInfoTask extends UpdateRobotBasicInfoTask {
  protected override async onExec(params: ValueMap, context?: ValueMap): Promise<ValueMap> {
    this.log.info({ cacheKey: params.cacheKey }, 'Simulating robot info update (mock)');

    await sleep(500);

    this.log.info('Update completed (mock)');

    return super.onExec(params, context);
  }
}
