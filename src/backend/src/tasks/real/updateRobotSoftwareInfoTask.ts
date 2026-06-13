import type { ValueMap } from "flowed";
import { BaseTask } from "../baseTask.js";
import type { RobotSoftwareInfo } from "./getRobotSoftwareInfoTask.js";
import type { MemStore } from "../../memStore/index.js";

export class UpdateRobotSoftwareInfoTask extends BaseTask {
  protected override async onExec(params: ValueMap, context?: ValueMap): Promise<ValueMap> {
    const cacheKey = params.cacheKey as string;
    const softwareInfo = params.softwareInfo as RobotSoftwareInfo;
    const memStore = context?.memStore as MemStore | undefined;

    if (cacheKey && softwareInfo && memStore) {
      memStore.updateCache(cacheKey, softwareInfo);
    }

    return { success: true, updated: true };
  }
}
