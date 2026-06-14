import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createInterface } from "node:readline";

interface StartOptions {
  port: number;
  dataDir: string;
}

function parseArgs(): StartOptions {
  let port = 30002;
  let dataDir = "./test-results/.e2e-data";

  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    if ((args[i] === "--port" || args[i] === "-p") && i + 1 < args.length) {
      port = parseInt(args[++i], 10);
    } else if ((args[i] === "--data-dir" || args[i] === "-d") && i + 1 < args.length) {
      dataDir = args[++i];
    }
  }

  return { port, dataDir };
}

async function waitForReady(child: ReturnType<typeof spawn>, timeoutMs = 30000): Promise<void> {
  const readyPattern = /RobotOps Studio started/i;

  return new Promise((resolvePromise, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Backend did not become ready within ${timeoutMs}ms`));
    }, timeoutMs);

    if (child.stdout) {
      const rl = createInterface({ input: child.stdout });
      rl.on("line", (line: string) => {
        process.stdout.write(line + "\n");
        if (readyPattern.test(line)) {
          clearTimeout(timer);
          rl.close();
          resolvePromise();
        }
      });
    }

    child.on("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`Backend process exited with code ${code}`));
    });
  });
}

async function main(): Promise<void> {
  const { port, dataDir } = parseArgs();
  const absDataDir = resolve(dataDir);
  const backendRoot = resolve(import.meta.dirname!, "../../backend");

  await mkdir(absDataDir, { recursive: true });
  await mkdir(resolve(absDataDir, "logs"), { recursive: true });

  const child = spawn(
    "npx",
    [
      "tsx",
      "src/index.ts",
      "--port",
      String(port),
      "--data-dir",
      absDataDir,
      "--mock",
    ],
    {
      cwd: backendRoot,
      env: { ...process.env, NODE_ENV: "test" },
      stdio: ["ignore", "pipe", "pipe"],
      detached: false,
    }
  );

  const pidFilePath = resolve(absDataDir, ".backend.pid");
  await writeFile(pidFilePath, String(child.pid));

  child.unref();

  try {
    await waitForReady(child, 30000);
    console.log(`\n[MOCK BACKEND] Ready at http://127.0.0.1:${port} (pid ${child.pid})`);
  } catch (err) {
    console.error(`Failed to start mock backend: ${err instanceof Error ? err.message : String(err)}`);
    try {
      process.kill(-child.pid!, "SIGTERM");
    } catch {
      // ignore
    }
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
