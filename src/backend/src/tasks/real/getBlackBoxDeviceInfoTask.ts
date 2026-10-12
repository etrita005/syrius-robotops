import type { ValueMap } from "flowed";
import { GetRobotBasicInfoTask } from "./getRobotBasicInfoTask.js";

/**
 * Resolves the device id (thingsId) used by the Collect BlackBox Logs flow.
 *
 * If a device id is provided manually through the `deviceId` parameter, it is used
 * directly and no SSH connection is made. Otherwise the task falls back to the
 * inherited SSH based robot basic info query.
 */
export class GetBlackboxDeviceInfoTask extends GetRobotBasicInfoTask {
  protected override async onExec(params: ValueMap): Promise<ValueMap> {
    const manualDeviceId =
      typeof params.deviceId === "string" ? params.deviceId.trim() : "";

    if (manualDeviceId) {
      this.log.info(
        { deviceId: manualDeviceId },
        'Using manually provided blackbox device id'
      );
      return {
        success: true,
        source: "manual",
        robotInfo: { thingsId: manualDeviceId },
      };
    }

    return super.onExec(params);
  }
}
