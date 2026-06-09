import { access, copyFile, rename, stat } from "node:fs/promises";
import { constants } from "node:fs";
import { basename, dirname, join } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(scriptDir, "..", "..");
const releaseRoot = join(repoRoot, "release");
const mode = process.env.PACKAGE_COMPRESS ?? "auto";

interface TargetBinary {
  raw: string;
  finalDir: string;
  finalName: string;
}

const targets: TargetBinary[] = [
  { raw: "robotops-studio-windows-amd64.exe", finalDir: "windows-amd64", finalName: "robotops-studio.exe" },
  { raw: "robotops-studio-macos-amd64", finalDir: "macos-amd64", finalName: "robotops-studio" },
  { raw: "robotops-studio-macos-arm64", finalDir: "macos-arm64", finalName: "robotops-studio" },
  { raw: "robotops-studio-linux-amd64", finalDir: "linux-amd64", finalName: "robotops-studio" },
  { raw: "robotops-studio-linux-arm64", finalDir: "linux-arm64", finalName: "robotops-studio" },
];

function run(command: string, args: string[]): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: "ignore" });
    child.on("error", () => resolve(false));
    child.on("exit", (code) => resolve(code === 0));
  });
}

async function hasCommand(command: string): Promise<boolean> {
  return run(command, ["--version"]);
}

async function compressWithUpx(filePath: string): Promise<boolean> {
  if (!(await hasCommand("upx"))) {
    return false;
  }
  return run("upx", ["--best", "--lzma", filePath]);
}

async function maybeCompress(filePath: string): Promise<void> {
  if (mode === "off") {
    return;
  }

  const before = (await stat(filePath)).size;
  const backup = `${filePath}.before-compress`;
  await copyFile(filePath, backup);
  const compressed = await compressWithUpx(filePath);

  if (!compressed) {
    await rename(backup, filePath).catch(async () => {
      await copyFile(backup, filePath);
    });
    if (mode === "on") {
      throw new Error("Binary compression failed or compression tool is unavailable.");
    }
    return;
  }

  const after = (await stat(filePath)).size;
  if (after > before) {
    await rename(backup, filePath).catch(async () => {
      await copyFile(backup, filePath);
    });
  }
}

async function ensureExists(pathValue: string): Promise<void> {
  await access(pathValue, constants.F_OK);
}

async function main(): Promise<void> {
  for (const target of targets) {
    const rawPath = join(releaseRoot, "_raw", target.raw);
    await ensureExists(rawPath).catch(() => {
      throw new Error(`Missing raw binary: ${basename(rawPath)}`);
    });
    await maybeCompress(rawPath);
  }
}

await main();
