import type { ValueMap } from "flowed";
import { MockGetRobotBasicInfoTask } from "./mockGetRobotBasicInfoTask.js";

/**
 * Mock variant of GetBlackboxDeviceInfoTask. It still honours a manually provided
 * device id so that mock mode behaves consistently with the real resolver.
 */
export class MockGetBlackboxDeviceInfoTask extends MockGetRobotBasicInfoTask {
  protected override async onExec(params: ValueMap): Promise<ValueMap> {
    const manualDeviceId =
      typeof params.deviceId === "string" ? params.deviceId.trim() : "";

    if (manualDeviceId) {
      return {
        success: true,
        source: "manual",
        robotInfo: { thingsId: manualDeviceId },
      };
    }

    return super.onExec(params);
  }
}
