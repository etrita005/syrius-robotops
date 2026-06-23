import type { ValueMap } from "flowed";
import { DeleteDragonball3Task } from "../real/deleteDragonball3Task.js";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class MockDeleteDragonball3Task extends DeleteDragonball3Task {
  protected override async onExec(_params: ValueMap): Promise<ValueMap> {
    this.log.info("Simulating dragonball3 cleanup (mock)");
    await sleep(500);
    return {
      done: true,
      success: true,
      stdout: "",
      stderr: "",
      exitCode: 0,
    };
  }
}
