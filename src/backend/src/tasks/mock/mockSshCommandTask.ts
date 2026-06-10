import type { ValueMap } from "flowed";
import { SshCommandTask } from "../real/sshCommandTask.js";
import { createLogger } from "../../logger/index.js";

const log = createLogger("SshCommand");

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class MockSshCommandTask extends SshCommandTask {
  override async exec(params: ValueMap): Promise<ValueMap> {
    const command = this.getSshCommand(params);

    log.info({ command }, 'Simulating SSH command (mock)');

    await sleep(2000);

    log.info('Command completed (mock)');

    return {
      done: true,
      success: true,
      stdout: "",
      stderr: "",
      exitCode: 0,
    };
  }
}
