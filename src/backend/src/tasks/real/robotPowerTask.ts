import type { ValueMap } from "flowed";
import { SshCommandTask, type SshCommandParams } from "./sshCommandTask.js";

export type PowerAction = "shutdown" | "reboot";

const DBUS_DEST = "com.syriusrobotics.bootstrapper";
const DBUS_PATH = "/com/syriusrobotics/bootstrapper";
const SHUTDOWN_METHOD = `${DBUS_DEST}.system.Shutdown`;

/** Plain reboot command, elevated to sudo by SshCommandTask. */
const REBOOT_COMMAND = "reboot";

function isPowerAction(value: unknown): value is PowerAction {
  return value === "shutdown" || value === "reboot";
}

function buildPowerCommand(action: PowerAction): string {
  if (action === "reboot") {
    return REBOOT_COMMAND;
  }
  return [
    "dbus-send",
    "--system",
    "--print-reply",
    `--dest=${DBUS_DEST}`,
    DBUS_PATH,
    SHUTDOWN_METHOD,
  ].join(" ");
}

export class RobotPowerTask extends SshCommandTask {
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
   * Power actions are fire-and-forget. Shutdown issues the bootstrapper D-Bus
   * Shutdown call, reboot runs `reboot`. The host goes down as soon as the
   * command is delivered, so the outcome can never be confirmed reliably: for
   * shutdown the `--print-reply` return is usually lost (yielding
   * `org.freedesktop.DBus.Error.NoReply`) and in both cases the SSH session
   * drops. Every failure is therefore ignored and reported as success; the
   * underlying error is still logged as a warning.
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
