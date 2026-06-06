import type { ValueMap } from "flowed";
import { SshCommandTask, type SshCommandParams } from "./sshCommandTask.js";

export interface DeleteRemotePathParams {
  targetPath: string;
}

export class DeleteRemotePathTask extends SshCommandTask {
  protected override buildParams(params: ValueMap): SshCommandParams {
    return super.buildParams({ ...params, sudo: true });
  }

  protected override getSshCommand(params: ValueMap): string {
    const targetPath = params.targetPath as string | undefined;
    if (!targetPath || typeof targetPath !== "string" || targetPath.trim() === "") {
      throw new Error("[DeleteRemotePath] 'targetPath' is required and must be a non-empty string");
    }

    const trimmed = targetPath.trim();
    if (trimmed === "/") {
      throw new Error("[DeleteRemotePath] Refusing to delete root path '/'");
    }

    const escapedPath = trimmed.replace(/"/g, '\\"');
    return `rm -rf -- "${escapedPath}"`;
  }
}
