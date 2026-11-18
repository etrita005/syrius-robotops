import type { ValueMap } from "flowed";
import { InstallDebPackageTask } from "../real/installDebPackageTask.js";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class MockInstallDebPackageTask extends InstallDebPackageTask {
  protected override async onExec(_params: ValueMap): Promise<ValueMap> {
    this.log.info("Simulating deb package installation (mock)");

    await sleep(3000);

    this.log.info("Deb package installation completed (mock)");

    return {
      done: true,
      success: true,
      stdout: "Deb package installed (mock).",
      stderr: "",
      exitCode: 0,
    };
  }
}
