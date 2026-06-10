import type { ValueMap } from "flowed";
import { SshCommandTask } from "./sshCommandTask.js";
import { createLogger } from "../../logger/index.js";

const log = createLogger("GetRobotSoftwareInfo");

const SOFTWARE_INFO_COMMAND =
  "MOVEBASE_VER=$(cat /opt/cosmos/etc/ota/version 2>/dev/null | sed '/^[[:space:]]*$/d; s/^[[:space:]]*//; s/[[:space:]]*$//');" +
  "MIN_SYS_VER=$(cat /mnt/cosmos/boot/etc/ota/minimal_system_version 2>/dev/null | sed '/^[[:space:]]*$/d; s/^[[:space:]]*//; s/[[:space:]]*$//');" +
  "L4T_VER=$(cat /etc/l4t_jurassic_release 2>/dev/null | sed '/^[[:space:]]*$/d; s/^[[:space:]]*//; s/[[:space:]]*$//');" +
  'echo "{\\"movebaseVersion\\":\\"$MOVEBASE_VER\\",\\"minimalSystemVersion\\":\\"$MIN_SYS_VER\\",\\"l4tVersion\\":\\"$L4T_VER\\"}"';

/**
 * Example output from the SSH command:
 * {"movebaseVersion":"3.0.0","minimalSystemVersion":"1.2.3","l4tVersion":"R35.4.1"}
 */
export interface RobotSoftwareInfo {
  movebaseVersion: string;
  minimalSystemVersion: string;
  l4tVersion: string;
}

export class GetRobotSoftwareInfoTask extends SshCommandTask {
  protected getSshCommand(_params: ValueMap): string {
    return SOFTWARE_INFO_COMMAND;
  }

  async exec(params: ValueMap): Promise<ValueMap> {
    const result = await super.exec(params);

    const stdout = (result.stdout as string) ?? "";
    const stderr = (result.stderr as string) ?? "";
    if (stderr) {
      log.info({ stderr: stderr.trim() }, "stderr output");
    }

    const softwareInfo = this.parseSoftwareInfo(stdout);

    log.info({ movebaseVersion: softwareInfo.movebaseVersion, l4tVersion: softwareInfo.l4tVersion }, "Parsed software info");

    return {
      success: true,
      rawOutput: stdout,
      softwareInfo,
    };
  }

  private parseSoftwareInfo(output: string): RobotSoftwareInfo {
    const jsonLine = output.split("\n").find((line) => line.trim().startsWith("{"));
    if (!jsonLine) {
      throw new Error("Failed to parse software info: no JSON output found");
    }
    try {
      return JSON.parse(jsonLine.trim()) as RobotSoftwareInfo;
    } catch {
      throw new Error(`Failed to parse software info JSON: ${jsonLine.trim()}`);
    }
  }
}
