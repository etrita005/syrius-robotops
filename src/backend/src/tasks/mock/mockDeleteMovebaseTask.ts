import type { ValueMap } from "flowed";
import { DeleteMovebaseTask } from "../real/deleteMovebaseTask.js";
import { createLogger } from "../../logger/index.js";

const log = createLogger("DeleteMovebase");

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class MockDeleteMovebaseTask extends DeleteMovebaseTask {
  override async exec(_params: ValueMap): Promise<ValueMap> {
    log.info('Simulating cleanup (mock)');

    await sleep(1000);

    log.info('Cleanup completed (mock)');

    return {
      done: true,
      success: true,
      stdout: "",
      stderr: "",
      exitCode: 0,
    };
  }
}
