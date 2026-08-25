import type { ValueMap } from "flowed";
import { FixBrokenPackagesTask } from "../real/fixBrokenPackagesTask.js";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class MockFixBrokenPackagesTask extends FixBrokenPackagesTask {
  protected override async onExec(_params: ValueMap): Promise<ValueMap> {
    const host = (_params.robotMdnsDomain as string) ?? (_params.robotIp as string);
    const port = (_params.robotPort as number) ?? 22;

    this.log.info(
      { host, port },
      "FixBrokenPackages: starting — stop cosmos-update-engine, clear dpkg locks, dpkg --configure -a, apt --fix-broken install"
    );

    this.log.info("Simulating fix broken packages (mock)");
    await sleep(3000);

    this.log.info(
      { host, port, exitCode: 0 },
      "FixBrokenPackages: succeeded"
    );

    return {
      done: true,
      success: true,
      stdout: "dpkg configured; apt fix-broken completed",
      stderr: "",
      exitCode: 0,
    };
  }
}
