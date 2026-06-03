import type { ValueMap } from "flowed";
import { GetRobotBasicInfoTask, type RobotBasicInfo } from "./getRobotBasicInfoTask.js";

const MOCK_ROBOT_INFO: RobotBasicInfo = {
  model: "MLLBA0201",
  robotSn: "SQADO420250306",
  thingsId: "M263DG67HJ",
  vendorId: "0x000036a1",
  productId: "0x00002410",
  mainBoardSn: "SyriusRobotics",
  mainBoardId: "WWVU0100406JCB06",
  mainSomSn: "1420124249761",
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class MockGetRobotBasicInfoTask extends GetRobotBasicInfoTask {
  async exec(_params: ValueMap): Promise<ValueMap> {
    await sleep(3000);
    return {
      success: true,
      rawOutput: JSON.stringify(MOCK_ROBOT_INFO),
      robotInfo: MOCK_ROBOT_INFO,
    };
  }
}
