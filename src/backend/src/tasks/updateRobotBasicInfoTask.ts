import type { ValueMap, ITaskResolver } from "flowed";
import type { RobotBasicInfo } from "./getRobotBasicInfoTask.js";
import { getGlobalMemStore } from "../memStore/index.js";

export class UpdateRobotBasicInfoTask implements ITaskResolver {
  async exec(params: ValueMap): Promise<ValueMap> {
    const cacheKey = params.cacheKey as string;
    const robotInfo = params.robotInfo as RobotBasicInfo;

    if (cacheKey && robotInfo) {
      getGlobalMemStore().updateCache(cacheKey, robotInfo);
    }

    return { success: true, updated: true };
  }
}
