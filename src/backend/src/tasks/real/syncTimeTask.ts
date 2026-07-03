import type { ValueMap } from "flowed";
import { SshCommandTask, type SshCommandParams } from "./sshCommandTask.js";

function formatTime(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  // Use UTC so the timestamp is interpreted as UTC regardless of the robot's timezone
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`;
}

export class SyncTimeTask extends SshCommandTask {
  private syncedTime: string = "";

  protected override buildParams(params: ValueMap): SshCommandParams {
    return super.buildParams({
      ...params,
      sudo: true,
      retryCount: 1,
      commandTimeout: (params.commandTimeout as number) ?? 10000,
    });
  }

  protected override getSshCommand(_params: ValueMap): string {
    const now = new Date();
    this.syncedTime = formatTime(now);
    return [
      `date -s "${this.syncedTime} UTC"`,
      "hwclock --systohc",
      "timedatectl set-local-rtc 0",
      "timedatectl set-local-rtc 1",
    ].join(" && ");
  }

  protected override async onExec(params: ValueMap, context?: ValueMap): Promise<ValueMap> {
    const result = await super.onExec(params, context);
    return {
      ...result,
      syncedTime: this.syncedTime,
    };
  }
}
