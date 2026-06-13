import type { ValueMap } from "flowed";
import { MatchMovebaseVersionTask } from "../real/matchMovebaseVersionTask.js";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class MockMatchMovebaseVersionTask extends MatchMovebaseVersionTask {
  protected override async onExec(params: ValueMap): Promise<ValueMap> {
    const expectedContent = this.getExpectedContent(params);

    this.log.info({ expectedContent }, "Simulating match movebase version (mock)");

    await sleep(2000);

    this.log.info({ expectedContent }, "Movebase version matched (mock)");

    return {
      done: true,
      success: true,
      matched: true,
      filePath: "/opt/cosmos/etc/ota/version",
      expectedContent,
      actualContent: expectedContent,
      stdout: expectedContent,
      stderr: "",
      exitCode: 0,
    };
  }
}
