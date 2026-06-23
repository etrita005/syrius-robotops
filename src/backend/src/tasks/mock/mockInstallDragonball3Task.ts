import type { ValueMap } from "flowed";
import { InstallDragonball3Task } from "../real/installDragonball3Task.js";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class MockInstallDragonball3Task extends InstallDragonball3Task {
  protected override async onExec(_params: ValueMap): Promise<ValueMap> {
    this.log.info("Simulating dragonball3 installation (mock)");

    await sleep(5000);

    this.log.info("Dragonball3 installation completed (mock)");

    return {
      done: true,
      success: true,
      stdout: "Selecting previously unselected package dragonball3.",
      stderr: "",
      exitCode: 0,
    };
  }
}
