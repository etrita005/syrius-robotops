import type { ValueMap } from "flowed";
import { SshCommandTask, type SshCommandParams } from "./sshCommandTask.js";
import { createLogger } from "../../logger/index.js";

const log = createLogger("MatchFileContent");

export class MatchFileContentTask extends SshCommandTask {
  protected getFilePath(params: ValueMap): string {
    return params.filePath as string;
  }

  protected getExpectedContent(params: ValueMap): string {
    return params.expectedContent as string;
  }

  protected override buildParams(params: ValueMap): SshCommandParams {
    const filePath = this.getFilePath(params);
    return super.buildParams({
      ...params,
      sshCommand: `cat "${filePath}"`,
      sudo: false,
      retryCount: 1,
    });
  }

  override async exec(params: ValueMap): Promise<ValueMap> {
    const expectedContent = this.getExpectedContent(params);
    const filePath = this.getFilePath(params);
    const result = await super.exec(params);
    const stdout = (result.stdout as string) ?? "";

    log.info({ filePath, expectedContent, actualContent: stdout.trim() }, "Comparing file content");

    if (stdout.trim() !== expectedContent.trim()) {
      throw new Error(
        `File content mismatch in ${filePath}: expected "${expectedContent.trim()}", got "${stdout.trim()}"`
      );
    }

    log.info({ filePath }, "File content matched");

    return {
      ...result,
      matched: true,
      filePath,
      expectedContent,
      actualContent: stdout.trim(),
    };
  }
}
