import type { ValueMap } from "flowed";
import { MatchBUPVersionTask } from "../real/matchBUPVersionTask.js";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class MockMatchBUPVersionTask extends MatchBUPVersionTask {
  protected override async onExec(params: ValueMap): Promise<ValueMap> {
    const expectedContent = this.getExpectedContent(params);

    this.log.info({ expectedContent }, "Simulating match BUP version (mock)");

    await sleep(2000);

    this.log.info({ expectedContent }, "BUP version matched (mock)");

    return {
      done: true,
      success: true,
      matched: true,
      filePath: "/etc/l4t_jurassic_release",
      expectedContent,
      actualContent: expectedContent,
      stdout: expectedContent,
      stderr: "",
      exitCode: 0,
    };
  }
}
