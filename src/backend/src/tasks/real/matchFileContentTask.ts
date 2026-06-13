import type { ValueMap } from "flowed";
import { SshCommandTask, type SshCommandParams } from "./sshCommandTask.js";

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

  protected doesContentMatch(actualContent: string, expectedContent: string): boolean {
    return actualContent.trim() === expectedContent.trim();
  }

  protected buildMismatchMessage(filePath: string, expectedContent: string, actualContent: string): string {
    return `File content mismatch in ${filePath}: expected "${expectedContent.trim()}", got "${actualContent.trim()}"`;
  }

  protected override async onExec(params: ValueMap): Promise<ValueMap> {
    const expectedContent = this.getExpectedContent(params);
    const filePath = this.getFilePath(params);
    const result = await super.onExec(params);
    const stdout = (result.stdout as string) ?? "";
    const actualContent = stdout.trim();

    this.log.info({ filePath, expectedContent, actualContent }, "Comparing file content");

    if (!this.doesContentMatch(actualContent, expectedContent)) {
      throw new Error(this.buildMismatchMessage(filePath, expectedContent, actualContent));
    }

    this.log.info({ filePath }, "File content matched");

    return {
      ...result,
      matched: true,
      filePath,
      expectedContent,
      actualContent,
    };
  }
}
