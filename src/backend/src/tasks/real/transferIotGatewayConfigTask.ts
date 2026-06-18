import type { ValueMap } from "flowed";
import { join } from "node:path";
import { SshFileTransferTask, type SshFileTransferParams } from "./sshFileTransferTask.js";

const SCRIPT_PATH = join(import.meta.dirname!, "..", "..", "..", "res", "update-iot-gateway-config.py");
const REMOTE_SCRIPT_PATH = "/tmp/update-iot-gateway-config.py";

export class TransferIotGatewayConfigTask extends SshFileTransferTask {
  protected override buildParams(params: ValueMap): SshFileTransferParams {
    return {
      ...super.buildParams({
        ...params,
        verifyChecksum: false,
        retryCount: 1,
      }),
      localFilePath: SCRIPT_PATH,
      remoteFilePath: REMOTE_SCRIPT_PATH,
    };
  }

  protected override async onExec(params: ValueMap, context?: ValueMap): Promise<ValueMap> {
    this.log.info({ localFilePath: SCRIPT_PATH, remoteFilePath: REMOTE_SCRIPT_PATH }, 'Transferring iot-gateway config update script');
    return super.onExec(params, context);
  }
}
