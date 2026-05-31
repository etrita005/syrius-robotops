import type { ValueMap, ITaskResolver } from "flowed";
import type { RobotBasicInfo } from "./getRobotBasicInfoTask.js";

type RobotInfoUpdateCallback = (solutionId: string, robotId: string, info: RobotBasicInfo) => Promise<void>;

let updateCallback: RobotInfoUpdateCallback | null = null;

export function setRobotInfoUpdateCallback(cb: RobotInfoUpdateCallback): void {
  updateCallback = cb;
}

export class UpdateRobotBasicInfoTask implements ITaskResolver {
  async exec(params: ValueMap): Promise<ValueMap> {
    const solutionId = params.solutionId as string;
    const robotId = params.robotId as string;
    const robotInfo = params.robotInfo as RobotBasicInfo;

    if (updateCallback && robotInfo) {
      await updateCallback(solutionId, robotId, robotInfo);
    }

    return { success: true, updated: true };
  }
}
