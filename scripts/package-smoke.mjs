import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const temporaryRoot = await mkdtemp(join(tmpdir(), "mcp-app-lab-package-"));
const npmCli = [
  process.env.npm_execpath,
  resolve(dirname(process.execPath), "node_modules/npm/bin/npm-cli.js"),
  resolve(dirname(process.execPath), "../lib/node_modules/npm/bin/npm-cli.js"),
].find((candidate) => candidate && existsSync(candidate));

if (!npmCli) throw new Error("Could not locate npm-cli.js");

function run(command, arguments_, options = {}) {
  const result = spawnSync(command, arguments_, {
    cwd: repositoryRoot,
    encoding: "utf8",
    ...options,
  });
  if (result.status !== 0) {
    process.stderr.write(result.stderr ?? "");
    process.stderr.write(result.stdout ?? "");
    throw new Error(`${command} exited with ${String(result.status)}`);
  }
  return result.stdout;
}

try {
  const packed = JSON.parse(
    run(process.execPath, [
      npmCli,
      "pack",
      "--ignore-scripts",
      "--json",
      "--pack-destination",
      temporaryRoot,
    ]),
  );
  const filename = packed[0]?.filename;
  if (typeof filename !== "string")
    throw new Error("npm pack returned no file");
  const archive = resolve(temporaryRoot, filename);
  const installRoot = resolve(temporaryRoot, "install");
  run(process.execPath, [
    npmCli,
    "install",
    "--prefix",
    installRoot,
    "--ignore-scripts",
    "--no-audit",
    "--no-fund",
    archive,
  ]);
  const manifest = JSON.parse(
    await readFile(
      resolve(installRoot, "node_modules/mcp-app-lab/package.json"),
      "utf8",
    ),
  );
  const installedCli = resolve(
    installRoot,
    "node_modules/mcp-app-lab/dist/node/cli.js",
  );
  const version = run(process.execPath, [installedCli, "--version"]).trim();
  run(process.execPath, [installedCli, "--help"]);
  if (version !== manifest.version) {
    throw new Error(
      `CLI ${version} does not match package ${manifest.version}`,
    );
  }
  process.stdout.write(
    `package smoke passed: ${manifest.name}@${manifest.version} (${filename})\n`,
  );
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}
