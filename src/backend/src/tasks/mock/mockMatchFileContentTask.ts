import type { ValueMap } from "flowed";
import { MatchFileContentTask } from "../real/matchFileContentTask.js";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class MockMatchFileContentTask extends MatchFileContentTask {
  protected override async onExec(params: ValueMap): Promise<ValueMap> {
    const filePath = this.getFilePath(params);
    const expectedContent = this.getExpectedContent(params);

    this.log.info({ filePath, expectedContent }, "Simulating file content match (mock)");

    await sleep(2000);

    this.log.info({ filePath }, "File content matched (mock)");

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
