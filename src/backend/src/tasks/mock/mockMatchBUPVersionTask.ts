import type { ValueMap } from "flowed";
import { MatchBUPVersionTask } from "../real/matchBUPVersionTask.js";
import { createLogger } from "../../logger/index.js";

const log = createLogger("MatchBUPVersion");

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class MockMatchBUPVersionTask extends MatchBUPVersionTask {
  override async exec(params: ValueMap): Promise<ValueMap> {
    const expectedContent = this.getExpectedContent(params);

    log.info({ expectedContent }, "Simulating match BUP version (mock)");

    await sleep(2000);

    log.info({ expectedContent }, "BUP version matched (mock)");

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
