import { join } from "node:path";

export type BlackboxRegion = "cn" | "ap";

export interface BlackboxRegionConfig {
  region: BlackboxRegion;
  broker: string;
  s3Bucket: string;
  s3Profile: string;
  certDir: string;
}

export const BLACKBOX_S3_BUCKET_CN = "s3://blackbox-report-context-fws-cn-cn-northwest-1/";
export const BLACKBOX_S3_BUCKET_AP = "s3://blackbox-report-context-fws-ap-northeast-1/";
export const BLACKBOX_S3_PROFILE_CN = "blackbox-cn-northwest-1";
export const BLACKBOX_S3_PROFILE_AP = "blackbox-ap-northeast-1";

const CERT_ROOT = join(import.meta.dirname, "..", "..", "..", "res", "blackbox");

export const BLACKBOX_REGIONS: BlackboxRegionConfig[] = [
  {
    region: "cn",
    broker: "ata3uja94tsje-ats.iot.cn-northwest-1.amazonaws.com.cn",
    s3Bucket: BLACKBOX_S3_BUCKET_CN,
    s3Profile: BLACKBOX_S3_PROFILE_CN,
    certDir: join(CERT_ROOT, "cn"),
  },
  {
    region: "ap",
    broker: "a34hbb7nd9fqwe-ats.iot.ap-northeast-1.amazonaws.com",
    s3Bucket: BLACKBOX_S3_BUCKET_AP,
    s3Profile: BLACKBOX_S3_PROFILE_AP,
    certDir: join(CERT_ROOT, "ap"),
  },
];

export function getBlackboxRegionConfig(region: string): BlackboxRegionConfig {
  const config = BLACKBOX_REGIONS.find((entry) => entry.region === region);
  if (!config) {
    throw new Error(`Unsupported blackbox region: ${region}`);
  }
  return config;
}
