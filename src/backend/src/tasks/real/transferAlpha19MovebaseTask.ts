import type { ValueMap } from "flowed";
import { SshFileTransferTask, type SshFileTransferParams } from "./sshFileTransferTask.js";

const REMOTE_TARGET_PATH = "/mnt/sdcard/offlineota/alpha1_9_movebase_offline_package.zip";

export class TransferAlpha19MovebaseTask extends SshFileTransferTask {
  protected override buildParams(params: ValueMap): SshFileTransferParams {
    return {
      ...super.buildParams({
        ...params,
        sudo: true,
        timeout: (params.timeout as number) ?? 120000,
      }),
      remoteFilePath: REMOTE_TARGET_PATH,
    };
  }

  protected override async onExec(params: ValueMap, context?: ValueMap): Promise<ValueMap> {
    const artifactService = context?.artifactService as { getArtifactPath(artifactId: string): Promise<string> } | undefined;
    const artifactId = params.artifactId as string | undefined;

    if (artifactId && artifactService) {
      const localFilePath = await artifactService.getArtifactPath(artifactId);
      this.log.info({ artifactId, localFilePath }, 'Resolved alpha1.9 movebase artifact path');
      const augmentedParams = { ...params, localFilePath };
      return super.onExec(augmentedParams, context);
    }

    return super.onExec(params, context);
  }
}
