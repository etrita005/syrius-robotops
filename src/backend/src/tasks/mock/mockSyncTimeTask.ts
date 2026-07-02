import type { ValueMap } from "flowed";
import { SyncTimeTask } from "../real/syncTimeTask.js";

function formatTime(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class MockSyncTimeTask extends SyncTimeTask {
  protected override async onExec(_params: ValueMap): Promise<ValueMap> {
    this.log.info("Simulating time sync (mock)");

    await sleep(1000);

    const syncedTime = formatTime(new Date());

    this.log.info({ syncedTime }, "Time sync completed (mock)");

    return {
      done: true,
      success: true,
      stdout: "",
      stderr: "",
      exitCode: 0,
      syncedTime,
    };
  }
}
