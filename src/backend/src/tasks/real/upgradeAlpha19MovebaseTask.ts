import type { ValueMap } from "flowed";
import { SshCommandTask, type SshCommandParams } from "./sshCommandTask.js";

const OFFLINE_OTA_DIR = "/mnt/sdcard/offlineota";
const PACKAGE_NAME = "alpha1_9_movebase_offline_package";
const PACKAGE_ZIP_PATH = `${OFFLINE_OTA_DIR}/${PACKAGE_NAME}.zip`;

const INSTALL_COMMAND = [
  `rm -rf ${OFFLINE_OTA_DIR}/${PACKAGE_NAME}-*`,
  `unzip -o ${PACKAGE_ZIP_PATH} -d ${OFFLINE_OTA_DIR}`,
  `bash ${OFFLINE_OTA_DIR}/${PACKAGE_NAME}-*/install_offline.sh`,
].join(" && ");

export class UpgradeAlpha19MovebaseTask extends SshCommandTask {
  protected override buildParams(params: ValueMap): SshCommandParams {
    return super.buildParams({
      ...params,
      sudo: true,
      commandTimeout: (params.commandTimeout as number) ?? 1800000,
    });
  }

  protected override getSshCommand(_params: ValueMap): string {
    return INSTALL_COMMAND;
  }
}
