import type { ValueMap } from "flowed";
import { UpdateRobotSoftwareInfoTask } from "../real/updateRobotSoftwareInfoTask.js";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class MockUpdateRobotSoftwareInfoTask extends UpdateRobotSoftwareInfoTask {
  protected override async onExec(params: ValueMap, context?: ValueMap): Promise<ValueMap> {
    this.log.info({ cacheKey: params.cacheKey }, "Simulating robot software info update (mock)");
    await sleep(500);
    this.log.info("Update completed (mock)");
    return super.onExec(params, context);
  }
}
