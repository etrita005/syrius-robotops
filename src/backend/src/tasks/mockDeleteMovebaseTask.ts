import type { ValueMap } from "flowed";
import { DeleteMovebaseTask } from "./deleteMovebaseTask.js";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class MockDeleteMovebaseTask extends DeleteMovebaseTask {
  override async exec(_params: ValueMap): Promise<ValueMap> {
    console.log(
      `[DeleteMovebase:Mock] Simulating cleanup`
    );

    await sleep(1000);

    console.log(
      `[DeleteMovebase:Mock] Cleanup completed (mock)`
    );

    return {
      success: true,
      stdout: "",
      stderr: "",
      exitCode: 0,
    };
  }
}
