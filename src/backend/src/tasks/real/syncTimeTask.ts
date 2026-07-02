import type { ValueMap } from "flowed";
import { SshCommandTask, type SshCommandParams } from "./sshCommandTask.js";

function formatTime(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
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
      `date -s "${this.syncedTime}"`,
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
