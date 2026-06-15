import type { ValueMap } from "flowed";
import { SshFileTransferTask, type SshFileTransferParams } from "./sshFileTransferTask.js";
import { join } from "node:path";

const CONFIG_PATH = join(import.meta.dirname!, "..", "..", "..", "res", "iot-gateway-application-prod.yaml");
const REMOTE_CONFIG_PATH = "/tmp/iot-gateway-application-prod.yaml";

export class TransferIotGatewayConfigTask extends SshFileTransferTask {
  protected override buildParams(params: ValueMap): SshFileTransferParams {
    return {
      ...super.buildParams({
        ...params,
        sudo: true,
        verifyChecksum: false,
        retryCount: 1,
      }),
      localFilePath: CONFIG_PATH,
      remoteFilePath: REMOTE_CONFIG_PATH,
    };
  }

  protected override async onExec(params: ValueMap, context?: ValueMap): Promise<ValueMap> {
    this.log.info({ localFilePath: CONFIG_PATH, remoteFilePath: REMOTE_CONFIG_PATH }, 'Transferring iot-gateway-application-prod.yaml');
    return super.onExec(params, context);
  }
}
