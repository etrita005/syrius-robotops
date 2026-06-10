import type { ValueMap } from "flowed";
import { MatchFileContentTask } from "./matchFileContentTask.js";
import type { SshCommandParams } from "./sshCommandTask.js";

const DEFAULT_VERSION_FILE_PATH = "/opt/cosmos/etc/ota/version";

export class MatchMovebaseVersionTask extends MatchFileContentTask {
  protected override getFilePath(_params: ValueMap): string {
    return DEFAULT_VERSION_FILE_PATH;
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
