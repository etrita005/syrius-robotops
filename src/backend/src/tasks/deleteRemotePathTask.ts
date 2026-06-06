import type { ValueMap } from "flowed";
import { SshCommandTask } from "./sshCommandTask.js";

export interface DeleteRemotePathParams {
  targetPath: string;
}

export class DeleteRemotePathTask extends SshCommandTask {
  protected override getSshCommand(params: ValueMap): string {
    const targetPath = params.targetPath as string | undefined;
    if (!targetPath || typeof targetPath !== "string" || targetPath.trim() === "") {
      throw new Error("[DeleteRemotePath] 'targetPath' is required and must be a non-empty string");
    }

    const trimmed = targetPath.trim();
    if (trimmed === "/") {
      throw new Error("[DeleteRemotePath] Refusing to delete root path '/'");
    }

    const sshPassword = params.sshPassword as string | undefined;
    if (!sshPassword) {
      throw new Error("[DeleteRemotePath] 'sshPassword' is required for sudo authentication");
    }

    const escapedPath = trimmed.replace(/"/g, '\\"');
    const command = `sudo -S -p '' rm -rf -- "${escapedPath}"`;
    return this.wrapWithSudoPassword(command, sshPassword);
  }
}
