import type { ValueMap } from "flowed";
import { SshCommandTask, type SshCommandParams } from "./sshCommandTask.js";

const REMOTE_SCRIPT_PATH = "/tmp/update-iot-gateway-config.py";

export class UpdateIotGatewayConfigTask extends SshCommandTask {
  protected override buildParams(params: ValueMap): SshCommandParams {
    return super.buildParams({
      ...params,
      sudo: true,
      commandTimeout: (params.commandTimeout as number) ?? 120000,
    });
  }

  protected override getSshCommand(_params: ValueMap): string {
    return [
      `python3 ${REMOTE_SCRIPT_PATH}`,
      `rm -f ${REMOTE_SCRIPT_PATH}`,
      'rm /opt/cosmos/var/cosmos_update_engine/apt/trusted.gpg* || true',
      'rm /opt/cosmos/var/cosmos_update_engine/apt/nexus.asc || true',
      'rm -rf /var/lib/apt/lists/* || true',
      'apt clean || true',
      'systemctl restart syrius-iot-gateway.service || true',
      'systemctl restart cosmos-update-engine.service || true',
    ].join(" && ");
  }
}
