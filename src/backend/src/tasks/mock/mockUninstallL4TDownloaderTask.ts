import type { ValueMap } from "flowed";
import { UninstallL4TDownloaderTask } from "../real/uninstallL4TDownloaderTask.js";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class MockUninstallL4TDownloaderTask extends UninstallL4TDownloaderTask {
  protected override async onExec(_params: ValueMap): Promise<ValueMap> {
    this.log.info("Simulating l4t-downloader uninstall (mock)");

    await sleep(2000);

    this.log.info("l4t-downloader uninstall completed (mock)");

    return {
      done: true,
      success: true,
      stdout: "l4t-downloader purged",
      stderr: "",
      exitCode: 0,
    };
  }
}
