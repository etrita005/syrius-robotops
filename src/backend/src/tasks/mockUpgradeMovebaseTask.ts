import type { ValueMap } from "flowed";
import { UpgradeMovebaseTask } from "./upgradeMovebaseTask.js";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class MockUpgradeMovebaseTask extends UpgradeMovebaseTask {
  override async exec(_params: ValueMap): Promise<ValueMap> {
    console.log(
      `[UpgradeMovebase:Mock] Simulating upgrade`
    );

    await sleep(5000);

    console.log(
      `[UpgradeMovebase:Mock] Upgrade completed (mock)`
    );

    return {
      done: true,
      success: true,
      stdout: "",
      stderr: "",
      exitCode: 0,
    };
  }
}
