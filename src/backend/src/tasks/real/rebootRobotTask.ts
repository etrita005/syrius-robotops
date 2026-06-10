import type { ValueMap } from "flowed";
import { SshCommandTask, type SshCommandParams } from "./sshCommandTask.js";
import { createLogger } from "../../logger/index.js";

const log = createLogger("RebootRobot");

const REBOOT_COMMAND = "reboot";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class RebootRobotTask extends SshCommandTask {
  protected getBootWaitMs(params: ValueMap): number {
    return (params.bootWaitMs as number) ?? 0;
  }

  protected override buildParams(params: ValueMap): SshCommandParams {
    return super.buildParams({
      ...params,
      sudo: true,
      retryCount: 1,
      commandTimeout: (params.commandTimeout as number) ?? 30000,
    });
  }

  protected override getSshCommand(_params: ValueMap): string {
    return REBOOT_COMMAND;
  }

  override async exec(params: ValueMap): Promise<ValueMap> {
    const bootWaitMs = this.getBootWaitMs(params);
    let result: ValueMap;

    try {
      result = await super.exec(params);
    } catch (err) {
      const msg = (err as Error).message.toLowerCase();
      if (
        msg.includes("timed out") ||
        msg.includes("connection lost") ||
        msg.includes("socket") ||
        msg.includes("econnreset") ||
        msg.includes("not connected") ||
        msg.includes("connection ended")
      ) {
        log.warn({ err: (err as Error).message }, "Connection lost after reboot (expected)");
        result = { done: true, success: true, stdout: "", stderr: "", exitCode: 0 };
      } else {
        throw err;
      }
    }

    if (bootWaitMs > 0) {
      log.info({ bootWaitMs }, "Waiting after reboot");
      await sleep(bootWaitMs);
    }

    return result;
  }
}
