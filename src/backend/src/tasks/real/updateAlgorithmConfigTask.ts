import type { ValueMap } from "flowed";
import { SshCommandTask, type SshCommandParams } from "./sshCommandTask.js";

const REMOTE_ZIP_PATH = "/tmp/algorithm_config_package.zip";
const REMOTE_CONFIG_ROOT_DIR = "/opt/cosmos/etc/rdconf";
const REMOTE_CONFIG_TREE_DIR = `${REMOTE_CONFIG_ROOT_DIR}/config_tree`;

export class UpdateAlgorithmConfigTask extends SshCommandTask {
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
      `unzip -o ${REMOTE_ZIP_PATH} -d ${REMOTE_CONFIG_ROOT_DIR}`,
      `chown -R cosmos:cosmos ${REMOTE_CONFIG_TREE_DIR}`,
    ].join(" && ");
  }
}
