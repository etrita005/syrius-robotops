import type { ValueMap } from "flowed";
import { UpgradeMovebaseTask } from "../real/upgradeMovebaseTask.js";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class MockUpgradeMovebaseTask extends UpgradeMovebaseTask {
  protected override async onExec(_params: ValueMap): Promise<ValueMap> {
    const host = (_params.robotMdnsDomain as string) ?? (_params.robotIp as string);
    const port = (_params.robotPort as number) ?? 22;

    this.log.info(
      { host, port, commandTimeout: (_params.commandTimeout as number) ?? 900000 },
      "UpgradeMovebase: starting — remove old package, unzip offline package, run install_offline.sh"
    );

    this.log.info("Simulating upgrade (mock)");
    await sleep(5000);

    this.log.info(
      { host, port, exitCode: 0 },
      "UpgradeMovebase: succeeded"
    );

    return {
      done: true,
      success: true,
      stdout: "",
      stderr: "",
      exitCode: 0,
    };
  }
}
