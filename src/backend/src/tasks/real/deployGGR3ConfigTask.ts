import type { ValueMap } from "flowed";
import { SshCommandTask, type SshCommandParams } from "./sshCommandTask.js";

const REMOTE_ZIP_PATH = "/tmp/ggr3_config.zip";
const REMOTE_EXTRACT_DIR = "/tmp/ggr3_config";
const ANDROID_TARGET_DIR = "/sdcard/Android/data/com.syriusrobotics.platform.launcher/files/ae";

export class DeployGGR3ConfigTask extends SshCommandTask {
  protected override buildParams(params: ValueMap): SshCommandParams {
    return super.buildParams({
      ...params,
      sudo: true,
      commandTimeout: (params.commandTimeout as number) ?? 60000,
      retryCount: 1,
    });
  }

  protected override getSshCommand(_params: ValueMap): string {
    return [
      `[ -f ${REMOTE_ZIP_PATH} ] || { echo "GGR3 config zip not found: ${REMOTE_ZIP_PATH}" >&2; exit 1; }`,
      `mkdir -p ${REMOTE_EXTRACT_DIR}`,
      `unzip -o ${REMOTE_ZIP_PATH} -d ${REMOTE_EXTRACT_DIR}`,
      `adb push ${REMOTE_EXTRACT_DIR}/. ${ANDROID_TARGET_DIR}/`,
      `rm -rf ${REMOTE_EXTRACT_DIR} ${REMOTE_ZIP_PATH}`,
    ].join(" && ");
  }
}
