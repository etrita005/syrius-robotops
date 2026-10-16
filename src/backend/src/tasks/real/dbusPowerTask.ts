import type { ValueMap } from "flowed";
import { SshCommandTask, type SshCommandParams } from "./sshCommandTask.js";

export type PowerAction = "shutdown" | "reboot";

const DBUS_DEST = "com.syriusrobotics.bootstrapper";
const DBUS_PATH = "/com/syriusrobotics/bootstrapper";

const POWER_METHODS: Record<PowerAction, string> = {
  shutdown: `${DBUS_DEST}.system.Shutdown`,
  reboot: `${DBUS_DEST}.system.Reboot`,
};

function isPowerAction(value: unknown): value is PowerAction {
  return value === "shutdown" || value === "reboot";
}

function buildPowerCommand(action: PowerAction): string {
  return [
    "dbus-send",
    "--system",
    "--print-reply",
    `--dest=${DBUS_DEST}`,
    DBUS_PATH,
    POWER_METHODS[action],
  ].join(" ");
}

export class DbusPowerTask extends SshCommandTask {
  protected override buildParams(params: ValueMap): SshCommandParams {
    return super.buildParams({
      ...params,
      sudo: true,
      retryCount: 1,
      commandTimeout: (params.commandTimeout as number) ?? 30000,
    });
  }

  protected override getSshCommand(params: ValueMap): string {
    const action = params.powerAction;
    if (!isPowerAction(action)) {
      throw new Error(`Invalid powerAction: ${String(action)}. Expected "shutdown" or "reboot".`);
    }
    return buildPowerCommand(action);
  }

  /**
   * Power actions are fire-and-forget. The host powers off or restarts as soon
   * as the D-Bus call is delivered, so the outcome can never be confirmed
   * reliably: the `--print-reply` return is usually lost (the host goes down
   * first, yielding `org.freedesktop.DBus.Error.NoReply`) and the SSH session
   * then drops. Every failure is therefore ignored and reported as success;
   * the underlying error is still logged as a warning.
   */
  protected override async onExec(params: ValueMap, context?: ValueMap): Promise<ValueMap> {
    try {
      return await super.onExec(params, context);
    } catch (err) {
      this.log.warn({ err: (err as Error).message }, "Power action failed (ignored)");
      return { done: true, success: true, stdout: "", stderr: "", exitCode: 0 };
    }
  }
}
