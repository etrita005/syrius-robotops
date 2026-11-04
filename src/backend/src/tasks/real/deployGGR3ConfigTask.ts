import type { ValueMap } from "flowed";
import { SshCommandTask, type SshCommandParams } from "./sshCommandTask.js";
import { SSH_PASSWORD } from "../../config.js";

const REMOTE_ZIP_PATH = "/tmp/ggr3_config.zip";
const REMOTE_EXTRACT_DIR = "/tmp/ggr3_config";
const ANDROID_TARGET_DIR = "/sdcard/Android/data/com.syriusrobotics.platform.launcher/files/ae";
const ADB_AUTHORIZE_TIMEOUT_SECONDS = 60;
const ADB_POLL_INTERVAL_SECONDS = 5;

export class DeployGGR3ConfigTask extends SshCommandTask {
  protected override buildParams(params: ValueMap): SshCommandParams {
    return super.buildParams({
      ...params,
      sudo: false,
      commandTimeout: (params.commandTimeout as number) ?? 120000,
      retryCount: 1,
    });
  }

  protected override getSshCommand(params: ValueMap): string {
    const sshPassword = (params.sshPassword as string) ?? SSH_PASSWORD;
    const sudo = `echo "${sshPassword}" | sudo -S -p ''`;

    return [
      "# Step 1: make sure the Android device is accessible through adb",
      `command -v adb >/dev/null 2>&1 || { echo "adb not found on robot" >&2; exit 1; }`,
      `ADB_STATE=$(adb shell echo ok 2>&1)`,
      `case "$ADB_STATE" in`,
      `  *unauthorized*)`,
      `    echo "ADB device unauthorized; resetting adb keys and restarting server" >&2`,
      `    ${sudo} rm -rf ~/.android`,
      `    adb kill-server`,
      `    adb start-server`,
      `    WAITED=0`,
      `    AUTHORIZED=0`,
      `    while [ "$WAITED" -lt ${ADB_AUTHORIZE_TIMEOUT_SECONDS} ]; do`,
      `      sleep ${ADB_POLL_INTERVAL_SECONDS}`,
      `      WAITED=$((WAITED + ${ADB_POLL_INTERVAL_SECONDS}))`,
      `      ADB_STATE=$(adb shell echo ok 2>&1)`,
      `      case "$ADB_STATE" in`,
      `        *ok*) AUTHORIZED=1; break ;;`,
      `        *unauthorized*) echo "ADB device still unauthorized after $WAITED seconds" >&2 ;;`,
      `        *) echo "ADB device is not accessible after resetting keys: $ADB_STATE" >&2; exit 1 ;;`,
      `      esac`,
      `    done`,
      `    [ "$AUTHORIZED" -eq 1 ] || { echo "ADB device is still unauthorized after ${ADB_AUTHORIZE_TIMEOUT_SECONDS} seconds" >&2; exit 1; }`,
      `    ;;`,
      `  *ok*) ;;`,
      `  *) echo "ADB device is not accessible: $ADB_STATE" >&2; exit 1 ;;`,
      `esac`,
      "# Step 2: deploy the config package to the Android target directory",
      `[ -f ${REMOTE_ZIP_PATH} ] || { echo "GGR3 config zip not found: ${REMOTE_ZIP_PATH}" >&2; exit 1; }`,
      `mkdir -p ${REMOTE_EXTRACT_DIR} || exit 1`,
      `unzip -o ${REMOTE_ZIP_PATH} -d ${REMOTE_EXTRACT_DIR} || exit 1`,
      `adb push ${REMOTE_EXTRACT_DIR}/. ${ANDROID_TARGET_DIR}/ || exit 1`,
      `rm -rf ${REMOTE_EXTRACT_DIR} ${REMOTE_ZIP_PATH}`,
    ].join("\n");
  }
}
