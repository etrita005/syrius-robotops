import type { ValueMap } from "flowed";
import { SshCommandTask, type SshCommandParams } from "./sshCommandTask.js";

const FIX_COMMAND = [
  "systemctl stop cosmos-update-engine.service || true",
  "sleep 3",
  "rm -f /var/lib/dpkg/lock*",
  "dpkg --configure -a",
  "DEBIAN_FRONTEND=noninteractive apt -o Dpkg::Options::=--force-overwrite -o Dir::Etc=/opt/cosmos/var/cosmos_update_engine/apt --allow-downgrades --fix-broken install -y",
].join(" && ");

export class FixBrokenPackagesTask extends SshCommandTask {
  protected override buildParams(params: ValueMap): SshCommandParams {
    return super.buildParams({
      ...params,
      sudo: true,
      retryCount: 1,
      commandTimeout: (params.commandTimeout as number) ?? 1800000,
    });
  }

  protected override getSshCommand(_params: ValueMap): string {
    return FIX_COMMAND;
  }

  protected override async onExec(params: ValueMap, context?: ValueMap): Promise<ValueMap> {
    const host = (params.robotMdnsDomain as string) ?? (params.robotIp as string);
    const port = (params.robotPort as number) ?? 22;

    this.log.info(
      { host, port },
      "FixBrokenPackages: starting — stop cosmos-update-engine, clear dpkg locks, dpkg --configure -a, apt --fix-broken install"
    );

    try {
      const result = await super.onExec(params, context);
      this.log.info(
        { host, port, exitCode: result.exitCode },
        "FixBrokenPackages: succeeded"
      );
      return result;
    } catch (err) {
      this.log.warn(
        { host, port, err: err instanceof Error ? err.message : String(err) },
        "FixBrokenPackages: failed (will be ignored if ignoreFailure is set)"
      );
      throw err;
    }
  }
}
