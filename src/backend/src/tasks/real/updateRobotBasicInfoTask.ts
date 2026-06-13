import type { ValueMap } from "flowed";
import { BaseTask } from "../baseTask.js";
import type { RobotBasicInfo } from "./getRobotBasicInfoTask.js";
import type { MemStore } from "../../memStore/index.js";

export class UpdateRobotBasicInfoTask extends BaseTask {
  protected override async onExec(params: ValueMap, context?: ValueMap): Promise<ValueMap> {
    const cacheKey = params.cacheKey as string;
    const robotInfo = params.robotInfo as RobotBasicInfo;
    const memStore = context?.memStore as MemStore | undefined;

    if (cacheKey && robotInfo && memStore) {
      memStore.updateCache(cacheKey, robotInfo);
    }

    return { success: true, updated: true };
  }
}
