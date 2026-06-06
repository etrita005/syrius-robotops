import type { ValueMap } from "flowed";
import { SshCommandTask } from "./sshCommandTask.js";
import { createLogger } from "../logger/index.js";

const log = createLogger("GetRobotBasicInfo");

const ROBOT_INFO_COMMAND =
  "MODEL=$(tr -d '\\0' < /sys/robotInfo/Model 2>/dev/null | sed '/^[[:space:]]*$/d; s/^[[:space:]]*//; s/[[:space:]]*$//');" +
  "ROBOTSN=$(tr -d '\\0' < /sys/robotInfo/RobotSN 2>/dev/null | sed '/^[[:space:]]*$/d; s/^[[:space:]]*//; s/[[:space:]]*$//');" +
  "DEV_JSON=$(tr -d '\\0' < /opt/cosmos/etc/secure/iot-gateway/device_id 2>/dev/null);" +
  "THINGSID=$(echo \"$DEV_JSON\" | grep -o '\"robot_deviceId\":\"[^\"]*\"' | cut -d'\"' -f4 | tr -d '\\0');" +
  "VENDORID=$(tr -d '\\0' < /sys/robotInfo/VendorID 2>/dev/null | sed '/^[[:space:]]*$/d; s/^[[:space:]]*//; s/[[:space:]]*$//');" +
  "PRODUCTID=$(tr -d '\\0' < /sys/robotInfo/ProductID 2>/dev/null | sed '/^[[:space:]]*$/d; s/^[[:space:]]*//; s/[[:space:]]*$//');" +
  "BOARDSN=$(tr -d '\\0' < /sys/robotInfo/BoardSN 2>/dev/null | sed '/^[[:space:]]*$/d; s/^[[:space:]]*//; s/[[:space:]]*$//');" +
  "BOARDID=$(tr -d '\\0' < /sys/robotInfo/BoardID 2>/dev/null | sed '/^[[:space:]]*$/d; s/^[[:space:]]*//; s/[[:space:]]*$//');" +
  "SOMSN=$(tr -d '\\0' < /sys/firmware/devicetree/base/serial-number 2>/dev/null | sed '/^[[:space:]]*$/d; s/^[[:space:]]*//; s/[[:space:]]*$//');" +
  'echo "{\\"model\\":\\"$MODEL\\",\\"robotSn\\":\\"$ROBOTSN\\",\\"thingsId\\":\\"$THINGSID\\",\\"vendorId\\":\\"$VENDORID\\",\\"productId\\":\\"$PRODUCTID\\",\\"mainBoardSn\\":\\"$BOARDSN\\",\\"mainBoardId\\":\\"$BOARDID\\",\\"mainSomSn\\":\\"$SOMSN\\"}"';

/**
 * Example output from the SSH command:
 * {"model":"MLLBA0201","robotSn":"SQADO420250306","thingsId":"M263DG67HJ","vendorId":"0x000036a1","productId":"0x00002410","mainBoardSn":"SyriusRobotics","mainBoardId":"WWVU0100406JCB06","mainSomSn":"1420124249761"}
 */
export interface RobotBasicInfo {
  model: string;
  robotSn: string;
  thingsId: string;
  vendorId: string;
  productId: string;
  mainBoardSn: string;
  mainBoardId: string;
  mainSomSn: string;
}

export class GetRobotBasicInfoTask extends SshCommandTask {
  protected getSshCommand(_params: ValueMap): string {
    return ROBOT_INFO_COMMAND;
  }

  async exec(params: ValueMap): Promise<ValueMap> {
    const result = await super.exec(params);

    const stdout = (result.stdout as string) ?? "";
    const stderr = (result.stderr as string) ?? "";
    if (stderr) {
      log.info({ stderr: stderr.trim() }, 'stderr output');
    }

    const robotInfo = this.parseRobotInfo(stdout);

    log.info({ model: robotInfo.model, robotSn: robotInfo.robotSn }, 'Parsed robot info');

    return {
      success: true,
      rawOutput: stdout,
      robotInfo,
    };
  }

  private parseRobotInfo(output: string): RobotBasicInfo {
    const jsonLine = output.split("\n").find((line) => line.trim().startsWith("{"));
    if (!jsonLine) {
      throw new Error("Failed to parse robot info: no JSON output found");
    }
    try {
      return JSON.parse(jsonLine.trim()) as RobotBasicInfo;
    } catch {
      throw new Error(`Failed to parse robot info JSON: ${jsonLine.trim()}`);
    }
  }
}
