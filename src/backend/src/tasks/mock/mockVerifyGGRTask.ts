import type { ValueMap } from "flowed";
import { VerifyGGRTask } from "../real/verifyGGRTask.js";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class MockVerifyGGRTask extends VerifyGGRTask {
  protected override async onExec(params: ValueMap): Promise<ValueMap> {
    const command = this.getSshCommand(params);

    this.log.info({ command }, "Simulating verify GGR version (mock)");

    await sleep(2000);

    this.log.info("Version verified (mock)");

    return {
      done: true,
      success: true,
      stdout: "2.4.9690",
      stderr: "",
      exitCode: 0,
    };
  }
}
