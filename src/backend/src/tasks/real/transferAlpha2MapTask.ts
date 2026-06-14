import type { ValueMap } from "flowed";
import { SshFileTransferTask, type SshFileTransferParams } from "./sshFileTransferTask.js";
import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const REMOTE_TARGET_PATH = "/tmp/alpha2_map_package.zip";

export class TransferAlpha2MapTask extends SshFileTransferTask {
  protected override buildParams(params: ValueMap): SshFileTransferParams {
    return {
      ...super.buildParams({ ...params, sudo: true }),
      remoteFilePath: REMOTE_TARGET_PATH,
    };
  }

  protected override async onExec(params: ValueMap, context?: ValueMap): Promise<ValueMap> {
    const artifactService = context?.artifactService as { download(artifactId: string, destinationPath: string): Promise<string> } | undefined;
    const artifactId = params.artifactId as string | undefined;

    if (artifactId && artifactService) {
      const tmpDir = join(tmpdir(), `alpha2map-transfer-${Date.now()}`);
      await mkdir(tmpDir, { recursive: true });

      try {
        const localFilePath = await artifactService.download(artifactId, tmpDir);
        this.log.info({ artifactId, localFilePath }, 'Resolved artifact');

        const augmentedParams = { ...params, localFilePath };
        const result = await super.onExec(augmentedParams, context);

        await rm(tmpDir, { recursive: true, force: true }).catch(() => {});

        return result;
      } catch (err) {
        await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
        throw err;
      }
    }

    return super.onExec(params, context);
  }
}
