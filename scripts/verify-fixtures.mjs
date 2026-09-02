import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cli = resolve(repositoryRoot, "dist/node/cli.js");
const cases = [
  { name: "bad-uri", exitCode: 1, finding: "APP001" },
  { name: "csp-injection", exitCode: 1, finding: "APP006" },
  { name: "wrong-mime", exitCode: 1, finding: "APP003" },
  { name: "navigation-escape", exitCode: 0 },
  { name: "resize-overflow", exitCode: 0 },
  { name: "schema-mismatch", exitCode: 0 },
  { name: "tool-error", exitCode: 0 },
  { name: "unsafe-postmessage", exitCode: 0 },
  { name: "unsupported-capability", exitCode: 0 },
];

for (const fixture of cases) {
  const config = resolve(repositoryRoot, "fixtures", `${fixture.name}.json`);
  const run = spawnSync(
    process.execPath,
    [cli, "test", "--config", config, "--json"],
    { cwd: repositoryRoot, encoding: "utf8" },
  );
  if (run.status !== fixture.exitCode) {
    process.stderr.write(run.stderr);
    process.stderr.write(run.stdout);
    throw new Error(
      `${fixture.name}: expected exit ${fixture.exitCode}, received ${String(run.status)}`,
    );
  }
  const report = JSON.parse(run.stdout);
  if (fixture.finding) {
    const matched = report.checks.some(
      (check) => check.id === fixture.finding && check.severity === "error",
    );
    if (!matched) {
      throw new Error(`${fixture.name}: missing ${fixture.finding} error`);
    }
  } else if (report.summary.errors !== 0) {
    throw new Error(`${fixture.name}: expected zero static errors`);
  }
  process.stdout.write(
    `${fixture.name}: ${report.summary.passes} pass / ${report.summary.warnings} warn / ${report.summary.errors} error\n`,
  );
}

process.stdout.write(`verified ${cases.length} adversarial fixtures\n`);
