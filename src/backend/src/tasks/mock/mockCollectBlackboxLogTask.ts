import type { ValueMap } from "flowed";
import { CollectBlackboxLogTask } from "../real/collectBlackboxLogTask.js";
import { buildCloudTaskId, parseProcessList } from "../../services/blackbox/blackboxProtocol.js";

const MOCK_BUCKET_CN = "s3://blackbox-report-context-fws-cn-cn-northwest-1/";
const MOCK_PROFILE_CN = "blackbox-cn-northwest-1";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildS3UrlForMock(deviceId: string, blackBoxTaskID: string): string {
  return `${MOCK_BUCKET_CN}${blackBoxTaskID.replace("_", `/${deviceId}/`)}.zip`;
}

export class MockCollectBlackboxLogTask extends CollectBlackboxLogTask {
  protected override async onExec(params: ValueMap): Promise<ValueMap> {
    const robotInfo = (params.robotInfo ?? {}) as { thingsId?: string };
    const deviceId = (robotInfo.thingsId ?? "").trim();
    const region = typeof params.region === "string" && params.region.trim()
      ? params.region.trim()
      : "cn";
    const processNames = parseProcessList(params.procList as string | string[] | undefined);

    this.log.info({ deviceId, region, processNames }, 'Simulating blackbox log collection (mock)');
    await sleep(1500);

    const cloudTaskID = buildCloudTaskId(new Date());
    const blackBoxTaskID = `${cloudTaskID}_${deviceId || "mock"}`;
    const s3Url = buildS3UrlForMock(deviceId || "mock", blackBoxTaskID);

    return {
      done: true,
      success: true,
      deviceId: deviceId || "mock",
      region,
      processNames,
      cloudTaskID,
      blackBoxTaskID,
      s3Url,
      s3LsCommand: `aws s3 --profile ${MOCK_PROFILE_CN} ls ${s3Url}`,
      s3CpCommand: `aws s3 --profile ${MOCK_PROFILE_CN} cp ${s3Url} .`,
    };
  }
}
