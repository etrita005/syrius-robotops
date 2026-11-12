import type { ValueMap } from "flowed";
import { SshCommandTask } from "./sshCommandTask.js";

const SOFTWARE_INFO_COMMAND =
  "MOVEBASE_VER=$(cat /opt/cosmos/etc/ota/version 2>/dev/null | sed '/^[[:space:]]*$/d; s/^[[:space:]]*//; s/[[:space:]]*$//');" +
  "MIN_SYS_VER=$(cat /mnt/cosmos/boot/etc/ota/minimal_system_version 2>/dev/null | sed '/^[[:space:]]*$/d; s/^[[:space:]]*//; s/[[:space:]]*$//');" +
  "GGR_VER=$(adb shell dumpsys package com.syriusrobotics.platform.launcher 2>/dev/null | grep versionName | head -n 1 | sed 's/ *versionName=//' | tr -d '\\r' | sed '/^[[:space:]]*$/d; s/^[[:space:]]*//; s/[[:space:]]*$//');" +
  "L4T_VER=$( (cat /etc/l4t_jurassic_release 2>/dev/null || cat /etc/jurassic_release 2>/dev/null) | sed '/^[[:space:]]*$/d; s/^[[:space:]]*//; s/[[:space:]]*$//');" +
  'echo "{\\"movebaseVersion\\":\\"$MOVEBASE_VER\\",\\"minimalSystemVersion\\":\\"$MIN_SYS_VER\\",\\"ggrVersion\\":\\"$GGR_VER\\",\\"l4tVersion\\":\\"$L4T_VER\\"}"';

/**
 * Example output from the SSH command:
 * {"movebaseVersion":"3.0.0","minimalSystemVersion":"1.2.3","ggrVersion":"buzzard-v1.945","l4tVersion":"R35.4.1"}
 */
export interface RobotSoftwareInfo {
  movebaseVersion: string;
  minimalSystemVersion: string;
  ggrVersion: string;
  l4tVersion: string;
}

export class GetRobotSoftwareInfoTask extends SshCommandTask {
  protected getSshCommand(_params: ValueMap): string {
    return SOFTWARE_INFO_COMMAND;
  }

  protected override async onExec(params: ValueMap): Promise<ValueMap> {
    const result = await super.onExec(params);

    const stdout = (result.stdout as string) ?? "";
    const stderr = (result.stderr as string) ?? "";
    if (stderr) {
      this.log.info({ stderr: stderr.trim() }, "stderr output");
    }

    const softwareInfo = this.parseSoftwareInfo(stdout);

    this.log.info({ movebaseVersion: softwareInfo.movebaseVersion, ggrVersion: softwareInfo.ggrVersion, l4tVersion: softwareInfo.l4tVersion }, "Parsed software info");

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
