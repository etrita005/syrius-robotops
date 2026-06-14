import { access, chmod, copyFile, mkdir, stat } from "node:fs/promises";
import { constants } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const srcRoot = join(scriptDir, "..");
const repoRoot = join(srcRoot, "..");
const releaseRoot = join(repoRoot, "release");
const configExample = join(srcRoot, "backend", "config.example.json");

interface TargetBinary {
  raw: string;
  finalDir: string;
  finalName: string;
  executable: boolean;
}

const targets: TargetBinary[] = [
  { raw: "robotops-studio-win.exe", finalDir: "windows-amd64", finalName: "robotops-studio.exe", executable: false },
  { raw: "robotops-studio-macos", finalDir: "macos-amd64", finalName: "robotops-studio", executable: true },
  { raw: "robotops-studio-linux", finalDir: "linux-amd64", finalName: "robotops-studio", executable: true },
];

async function main(): Promise<void> {
  for (const target of targets) {
    const rawPath = join(releaseRoot, "_raw", target.raw);
    await access(rawPath, constants.F_OK);
    const rawStat = await stat(rawPath);
    if (rawStat.size <= 0) {
      throw new Error(`Empty binary: ${target.raw}`);
    }

    const targetDir = join(releaseRoot, target.finalDir);
    const finalPath = join(targetDir, target.finalName);
    await mkdir(targetDir, { recursive: true });
    await copyFile(rawPath, finalPath);
    await copyFile(configExample, join(targetDir, "config.example.json"));

    if (target.executable) {
      await chmod(finalPath, 0o755);
    }
  }
}

await main();
