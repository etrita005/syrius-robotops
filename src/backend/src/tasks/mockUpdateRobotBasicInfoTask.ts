import type { ValueMap } from "flowed";
import { UpdateRobotBasicInfoTask } from "./updateRobotBasicInfoTask.js";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class MockUpdateRobotBasicInfoTask extends UpdateRobotBasicInfoTask {
  override async exec(params: ValueMap, context?: ValueMap): Promise<ValueMap> {
    console.log(
      `[UpdateRobotBasicInfo:Mock] Simulating robot info update for cacheKey=${params.cacheKey}`
    );

    await sleep(500);

    console.log(
      `[UpdateRobotBasicInfo:Mock] Update completed (mock)`
    );

    return super.exec(params, context);
  }
}
