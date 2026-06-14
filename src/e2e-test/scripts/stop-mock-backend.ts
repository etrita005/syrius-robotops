import { readFile, unlink } from "node:fs/promises";
import { resolve } from "node:path";

interface StopOptions {
  dataDir: string;
}

function parseArgs(): StopOptions {
  let dataDir = "./test-results/.e2e-data";

  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    if ((args[i] === "--data-dir" || args[i] === "-d") && i + 1 < args.length) {
      dataDir = args[++i];
    }
  }

  return { dataDir };
}

async function main(): Promise<void> {
  const { dataDir } = parseArgs();
  const pidFilePath = resolve(dataDir, ".backend.pid");

  let pid: number | null = null;
  try {
    const pidStr = await readFile(pidFilePath, "utf8");
    pid = parseInt(pidStr.trim(), 10);
  } catch {
    console.log("No PID file found, backend may not be running.");
    return;
  }

  if (!pid || isNaN(pid)) {
    console.log("Invalid PID in file, cleaning up.");
    await unlink(pidFilePath).catch(() => {});
    return;
  }

  try {
    process.kill(pid, "SIGTERM");
    console.log(`Sent SIGTERM to backend process ${pid}`);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ESRCH") {
      console.log(`Process ${pid} not found, cleaning up PID file.`);
    } else {
      console.error(`Failed to stop process ${pid}: ${(err as Error).message}`);
    }
  }

  await unlink(pidFilePath).catch(() => {});
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
