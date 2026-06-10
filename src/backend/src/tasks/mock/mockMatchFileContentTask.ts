import type { ValueMap } from "flowed";
import { MatchFileContentTask } from "../real/matchFileContentTask.js";
import { createLogger } from "../../logger/index.js";

const log = createLogger("MatchFileContent");

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class MockMatchFileContentTask extends MatchFileContentTask {
  override async exec(params: ValueMap): Promise<ValueMap> {
    const filePath = this.getFilePath(params);
    const expectedContent = this.getExpectedContent(params);

    log.info({ filePath, expectedContent }, "Simulating file content match (mock)");

    await sleep(2000);

    log.info({ filePath }, "File content matched (mock)");

    return {
      done: true,
      success: true,
      matched: true,
      filePath,
      expectedContent,
      actualContent: expectedContent,
      stdout: expectedContent,
      stderr: "",
      exitCode: 0,
    };
  }
}
