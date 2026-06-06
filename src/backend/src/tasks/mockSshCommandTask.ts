import type { ValueMap } from "flowed";
import { SshCommandTask } from "./sshCommandTask.js";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class MockSshCommandTask extends SshCommandTask {
  override async exec(params: ValueMap): Promise<ValueMap> {
    const command = this.getSshCommand(params);

    console.log(
      `[SshCommand:Mock] Simulating SSH command: ${command}`
    );

    await sleep(2000);

    console.log(
      `[SshCommand:Mock] Command completed (mock)`
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
