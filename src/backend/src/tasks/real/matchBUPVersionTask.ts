import type { ValueMap } from "flowed";
import { MatchFileContentTask } from "./matchFileContentTask.js";
import type { SshCommandParams } from "./sshCommandTask.js";

const DEFAULT_BUP_VERSION_FILE_PATH = "/etc/l4t_jurassic_release";

export class MatchBUPVersionTask extends MatchFileContentTask {
  protected override getFilePath(_params: ValueMap): string {
    return DEFAULT_BUP_VERSION_FILE_PATH;
  }

  protected override buildParams(params: ValueMap): SshCommandParams {
    return super.buildParams({
      ...params,
      retryCount: (params.retryCount as number) ?? 10,
      commandTimeout: (params.commandTimeout as number) ?? 30000,
      connectTimeout: (params.connectTimeout as number) ?? 10000,
    });
  }
}
