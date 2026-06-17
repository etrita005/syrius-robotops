import type { ValueMap } from "flowed";
import { SshCommandTask, type SshCommandParams } from "./sshCommandTask.js";

export interface MovebaseDiskCleanupParams {
  cleanUserHomes?: boolean | string;
}

function toBoolean(value: unknown, defaultValue: boolean): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value.trim().toLowerCase() === "true";
  return defaultValue;
}

export class MovebaseDiskCleanupTask extends SshCommandTask {
  protected override buildParams(params: ValueMap): SshCommandParams {
    return super.buildParams({
      ...params,
      sudo: true,
      commandTimeout: (params.commandTimeout as number) ?? 10000,
      retryCount: (params.retryCount as number) ?? 1,
    });
  }

  protected override getSshCommand(params: ValueMap): string {
    const cleanUserHomes = toBoolean(params.cleanUserHomes, false);

    return [
      "rm -rf -- /etc/l4t_ota",
      "find /opt/cosmos/ota/recovery -maxdepth 1 -type f \\( -name '*.deb' -o -name '*.apk' \\) -delete 2>/dev/null || true",
      "rm -rf -- /opt/cosmos/lib/vendor",
      "find /mnt/cosmos/boot/lib/bootstrapper -mindepth 1 -maxdepth 1 -exec rm -rf -- {} + 2>/dev/null || true",
      "rm -rf -- /mnt/cosmos/boot/l4t_ota",
      cleanUserHomes
        ? "find /home/developer /home/factory -mindepth 1 -maxdepth 1 -exec rm -rf -- {} + 2>/dev/null || true"
        : "true",
    ].join(" && ");
  }
}
