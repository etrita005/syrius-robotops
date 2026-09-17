import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { connect, type IClientOptions, type MqttClient } from "mqtt";
import type { Logger } from "../../logger/index.js";
import {
  getBlackboxRegionConfig,
  type BlackboxRegion,
  type BlackboxRegionConfig,
} from "./blackboxConfig.js";
import {
  buildCloudTaskId,
  buildRequestPayload,
  buildS3Commands,
  buildS3Url,
  buildTopics,
  isCreateTaskSucceeded,
  parseProcessList,
  parseTaskFinishedMessage,
  type BlackboxTaskFinishedInfo,
} from "./blackboxProtocol.js";

const MQTT_PORT = 8883;
export const DEFAULT_BLACKBOX_TIMEOUT_MS = 6_000_000;
const CONNECT_RETRY_COUNT = 3;
const CONNECT_TIMEOUT_MS = 10_000;

export interface CollectBlackboxLogsOptions {
  deviceId: string;
  region: string;
  processNames: string | string[];
  timeoutMs?: number;
  log: Logger;
}

export interface CollectBlackboxLogsResult {
  deviceId: string;
  region: BlackboxRegion;
  processNames: string[];
  cloudTaskID: string;
  blackBoxTaskID: string;
  s3Url: string;
  s3LsCommand: string;
  s3CpCommand: string;
}

interface TopicSet {
  keepalive: string;
  request: string;
  response: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function loadCerts(config: BlackboxRegionConfig): { ca: Buffer; cert: Buffer; key: Buffer } {
  const files = ["root-CA.crt", "blackbox_devices.cert.pem", "blackbox_devices.private.key"];
  for (const file of files) {
    const filePath = join(config.certDir, file);
    if (!existsSync(filePath)) {
      throw new Error(`Blackbox cert file not found: ${filePath}`);
    }
  }
  return {
    ca: readFileSync(join(config.certDir, "root-CA.crt")),
    cert: readFileSync(join(config.certDir, "blackbox_devices.cert.pem")),
    key: readFileSync(join(config.certDir, "blackbox_devices.private.key")),
  };
}

function connectOnce(config: BlackboxRegionConfig, deviceId: string, log: Logger): Promise<MqttClient> {
  const clientId = `blackbox_${deviceId}_${Date.now()}`;
  const certs = loadCerts(config);
  const options: IClientOptions = {
    clientId,
    port: MQTT_PORT,
    ca: certs.ca,
    cert: certs.cert,
    key: certs.key,
    clean: true,
    keepalive: 60,
    connectTimeout: CONNECT_TIMEOUT_MS,
    reconnectPeriod: 0,
    rejectUnauthorized: true,
  };

  return new Promise<MqttClient>((resolve, reject) => {
    let settled = false;
    log.debug({ broker: config.broker, port: MQTT_PORT, clientId }, 'Connecting blackbox MQTT client');
    const client = connect(`mqtts://${config.broker}`, options);
    client.once("connect", () => {
      settled = true;
      log.info({ broker: config.broker, clientId }, 'Blackbox MQTT connected');
      resolve(client);
    });
    client.once("error", (err: Error) => {
      if (!settled) {
        settled = true;
        client.end(true);
        log.warn({ broker: config.broker, err: err.message }, 'Blackbox MQTT connect failed');
        reject(err);
      }
    });
  });
}

async function connectWithRetry(
  config: BlackboxRegionConfig,
  deviceId: string,
  log: Logger
): Promise<MqttClient> {
  let lastError: Error | undefined;
  for (let attempt = 1; attempt <= CONNECT_RETRY_COUNT; attempt += 1) {
    try {
      return await connectOnce(config, deviceId, log);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < CONNECT_RETRY_COUNT) {
        await sleep(1000 * attempt);
      }
    }
  }
  throw lastError ?? new Error("Failed to connect to blackbox MQTT broker");
}

function subscribeTopics(client: MqttClient, topics: TopicSet): Promise<void> {
  return new Promise((resolve, reject) => {
    client.subscribe([topics.response, topics.keepalive], (err: Error | null) => {
      if (err) {
        reject(err);
        return;
      }
      resolve();
    });
  });
}

function publishMessage(client: MqttClient, topic: string, message: string): Promise<void> {
  return new Promise((resolve, reject) => {
    client.publish(topic, message, (err?: Error) => {
      if (err) {
        reject(err);
        return;
      }
      resolve();
    });
  });
}

function waitForTaskFinished(
  client: MqttClient,
  topics: TopicSet,
  cloudTaskId: string,
  timeoutMs: number,
  log: Logger
): Promise<BlackboxTaskFinishedInfo> {
  return new Promise((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let finished = false;

    const cleanup = (): void => {
      if (timer) clearTimeout(timer);
      client.removeListener("message", onMessage);
      client.removeListener("close", onClose);
      client.removeListener("error", onError);
    };

    const onMessage = (topic: string, payload: Buffer): void => {
      if (topic !== topics.response) return;
      const text = payload.toString("utf8");
      if (isCreateTaskSucceeded(text)) {
        log.info({ cloudTaskId }, 'Blackbox create task succeeded');
        return;
      }
      const info = parseTaskFinishedMessage(text);
      if (!info) {
        log.debug({ topic, length: text.length }, 'Ignoring blackbox response message');
        return;
      }
      finished = true;
      cleanup();
      resolve(info);
    };

    const onClose = (): void => {
      if (!finished) {
        cleanup();
        reject(new Error("Blackbox MQTT connection closed before task finished"));
      }
    };

    const onError = (err: Error): void => {
      if (!finished) {
        cleanup();
        reject(new Error(`Blackbox MQTT error: ${err.message}`));
      }
    };

    timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for blackbox log collection (${timeoutMs}ms)`));
    }, timeoutMs);

    client.on("message", onMessage);
    client.on("close", onClose);
    client.on("error", onError);
  });
}

export async function collectBlackboxLogs(
  options: CollectBlackboxLogsOptions
): Promise<CollectBlackboxLogsResult> {
  const { deviceId, region, log } = options;
  const timeoutMs = options.timeoutMs ?? DEFAULT_BLACKBOX_TIMEOUT_MS;
  const processNames = parseProcessList(options.processNames);
  if (!deviceId.trim()) {
    throw new Error("Device ID is missing");
  }
  if (processNames.length === 0) {
    throw new Error("Process list must not be empty");
  }

  const config = getBlackboxRegionConfig(region);
  const topics = buildTopics(deviceId);
  const cloudTaskId = buildCloudTaskId(new Date());
  const requestPayload = buildRequestPayload(cloudTaskId, processNames);

  log.info(
    { deviceId, region: config.region, processNames, cloudTaskId },
    'Triggering blackbox log collection'
  );

  const client = await connectWithRetry(config, deviceId, log);
  try {
    await subscribeTopics(client, topics);
    await publishMessage(client, topics.keepalive, "");
    log.debug({ deviceId }, 'Published blackbox keepalive');
    await publishMessage(client, topics.request, requestPayload);
    log.debug({ deviceId, cloudTaskId }, 'Published blackbox collect request');

    const info = await waitForTaskFinished(client, topics, cloudTaskId, timeoutMs, log);
    const blackBoxTaskID = info.blackBoxTaskID;
    const s3Url = buildS3Url(config.s3Bucket, deviceId, blackBoxTaskID);
    const commands = buildS3Commands(config.s3Profile, s3Url);

    log.info(
      { deviceId, cloudTaskID: info.cloudTaskID, blackBoxTaskID, s3Url },
      'Blackbox log collection finished'
    );

    return {
      deviceId,
      region: config.region,
      processNames,
      cloudTaskID: info.cloudTaskID || cloudTaskId,
      blackBoxTaskID,
      s3Url,
      s3LsCommand: commands.s3LsCommand,
      s3CpCommand: commands.s3CpCommand,
    };
  } finally {
    client.end(true);
    log.debug({ deviceId }, 'Blackbox MQTT disconnected');
  }
}
