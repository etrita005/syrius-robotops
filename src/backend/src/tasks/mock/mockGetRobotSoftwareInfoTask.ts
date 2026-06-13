import type { ValueMap } from "flowed";
import { GetRobotSoftwareInfoTask, type RobotSoftwareInfo } from "../real/getRobotSoftwareInfoTask.js";

const MOCK_SOFTWARE_INFO: RobotSoftwareInfo = {
  movebaseVersion: "3.0.0",
  minimalSystemVersion: "1.2.3",
  l4tVersion: "R35.4.1",
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class MockGetRobotSoftwareInfoTask extends GetRobotSoftwareInfoTask {
  protected override async onExec(_params: ValueMap): Promise<ValueMap> {
    await sleep(1500);
    return {
      success: true,
      rawOutput: JSON.stringify(MOCK_SOFTWARE_INFO),
      softwareInfo: MOCK_SOFTWARE_INFO,
    };
  }
}
