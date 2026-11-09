import type { ValueMap } from "flowed";
import { UpgradeAlpha19MovebaseTask } from "../real/upgradeAlpha19MovebaseTask.js";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class MockUpgradeAlpha19MovebaseTask extends UpgradeAlpha19MovebaseTask {
  protected override async onExec(_params: ValueMap): Promise<ValueMap> {
    this.log.info("Simulating alpha1.9 movebase upgrade (mock)");

    await sleep(5000);

    this.log.info("Alpha1.9 movebase upgrade completed (mock)");

    return {
      done: true,
      success: true,
      stdout: "",
      stderr: "",
      exitCode: 0,
    };
  }
}
