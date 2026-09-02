import { copyFile, mkdir, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const snapshotRoot = resolve(repositoryRoot, "tests/e2e/lab.spec.ts-snapshots");
const assetRoot = resolve(repositoryRoot, "assets");
const copies = [
  ["mcp-app-lab-chromium-win32.png", "workbench.png"],
  ["mcp-app-lab-bad-chromium-win32.png", "demo.png"],
];

await mkdir(assetRoot, { recursive: true });
for (const [sourceName, targetName] of copies) {
  const source = resolve(snapshotRoot, sourceName);
  const target = resolve(assetRoot, targetName);
  await copyFile(source, target);
  const copied = await stat(target);
  process.stdout.write(`synced ${targetName} (${copied.size} bytes)\n`);
}
