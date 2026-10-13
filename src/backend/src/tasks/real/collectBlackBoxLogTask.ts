import type { ValueMap } from "flowed";
import { BaseTask } from "../baseTask.js";
import { collectBlackboxLogs } from "../../services/blackbox/blackboxClient.js";
import { parseProcessList } from "../../services/blackbox/blackboxProtocol.js";

interface RobotInfoLike {
  thingsId?: string;
}

export interface CollectBlackboxRunOptions {
  deviceId: string;
  region: string;
  processNames: string[];
}

export class CollectBlackboxLogTask extends BaseTask {
  protected async runCollect(options: CollectBlackboxRunOptions): Promise<Record<string, unknown>> {
    const result = await collectBlackboxLogs({
      deviceId: options.deviceId,
      region: options.region,
      processNames: options.processNames,
      log: this.log,
    });
    return {
      deviceId: result.deviceId,
      region: result.region,
      processNames: result.processNames,
      cloudTaskID: result.cloudTaskID,
      blackBoxTaskID: result.blackBoxTaskID,
      s3Url: result.s3Url,
      s3LsCommand: result.s3LsCommand,
      s3CpCommand: result.s3CpCommand,
    };
  }

  protected override async onExec(params: ValueMap): Promise<ValueMap> {
    const robotInfo = (params.robotInfo ?? {}) as RobotInfoLike;
    const deviceId = (robotInfo.thingsId ?? "").trim();
    if (!deviceId) {
      throw new Error("Device ID is missing in robotInfo");
    }

    const region = typeof params.region === "string" && params.region.trim()
      ? params.region.trim()
      : "cn";
    const processNames = parseProcessList(params.procList as string | string[] | undefined);
    if (processNames.length === 0) {
      throw new Error("Process list must not be empty");
    }

    this.log.info({ deviceId, region, processNames }, 'Collecting blackbox logs');
    const result = await this.runCollect({ deviceId, region, processNames });

    this.log.info(
      {
        deviceId,
        region,
        cloudTaskID: result.cloudTaskID,
        blackBoxTaskID: result.blackBoxTaskID,
        s3Url: result.s3Url,
      },
      'Blackbox log collection succeeded'
    );

    return {
      done: true,
      success: true,
      ...result,
    };
  }
}
