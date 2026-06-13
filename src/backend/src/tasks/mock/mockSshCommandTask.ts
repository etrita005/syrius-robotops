import type { ValueMap } from "flowed";
import { SshCommandTask } from "../real/sshCommandTask.js";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class MockSshCommandTask extends SshCommandTask {
  protected override async onExec(params: ValueMap): Promise<ValueMap> {
    const command = this.getSshCommand(params);

    this.log.info({ command }, 'Simulating SSH command (mock)');

    await sleep(2000);

    this.log.info('Command completed (mock)');

    return {
      done: true,
      success: true,
      stdout: "",
      stderr: "",
      exitCode: 0,
    };
  }
}
