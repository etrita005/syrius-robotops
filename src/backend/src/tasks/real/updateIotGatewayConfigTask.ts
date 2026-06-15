import type { ValueMap } from "flowed";
import { SshCommandTask, type SshCommandParams } from "./sshCommandTask.js";

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
      'mv /tmp/iot-gateway-application-prod.yaml /mnt/cosmos/boot/etc/iot-gateway/application-prod.yaml',
      'chown iot-gateway:iot-gateway /mnt/cosmos/boot/etc/iot-gateway/application-prod.yaml',
      'rm /opt/cosmos/var/cosmos_update_engine/apt/trusted.gpg* || true',
      'rm /opt/cosmos/var/cosmos_update_engine/apt/nexus.asc || true',
      'rm -rf /var/lib/apt/lists/* || true',
      'apt clean || true',
      'systemctl restart syrius-iot-gateway.service || true',
      'systemctl restart cosmos-update-engine.service || true',
    ].join(" && ");
  }
}
