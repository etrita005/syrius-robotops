import type { ValueMap } from "flowed";
import { DeleteMovebaseTask } from "../real/deleteMovebaseTask.js";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class MockDeleteMovebaseTask extends DeleteMovebaseTask {
  protected override async onExec(_params: ValueMap): Promise<ValueMap> {
    this.log.info('Simulating cleanup (mock)');

    await sleep(1000);

    this.log.info('Cleanup completed (mock)');

    return {
      done: true,
      success: true,
      stdout: "",
      stderr: "",
      exitCode: 0,
    };
  }
}
