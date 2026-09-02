import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const repositoryRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const tsxCli = resolve(repositoryRoot, "node_modules/tsx/dist/cli.mjs");
const sourceCli = resolve(repositoryRoot, "src/node/cli.ts");

function runCli(
  args: string[],
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolveRun, reject) => {
    const child = spawn(process.execPath, [tsxCli, sourceCli, ...args], {
      cwd: repositoryRoot,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on(
      "data",
      (chunk: Buffer) => (stdout += chunk.toString("utf8")),
    );
    child.stderr.on(
      "data",
      (chunk: Buffer) => (stderr += chunk.toString("utf8")),
    );
    child.once("error", reject);
    child.once("exit", (code) => resolveRun({ code, stdout, stderr }));
  });
}

describe("CLI", () => {
  it("exposes dev, test, and replay commands", async () => {
    const result = await runCli(["--help"]);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("dev");
    expect(result.stdout).toContain("test");
    expect(result.stdout).toContain("replay");
  });

  it("returns zero and JSON for a conforming server", async () => {
    const result = await runCli([
      "test",
      "--config",
      "examples/good.config.json",
      "--json",
    ]);

    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual(
      expect.objectContaining({
        summary: expect.objectContaining({ errors: 0 }),
      }),
    );
  }, 20_000);

  it("returns a non-zero code for the wrong-MIME fixture", async () => {
    const result = await runCli([
      "test",
      "--config",
      "examples/wrong-mime.config.json",
      "--json",
    ]);

    expect(result.code).toBe(1);
    expect(JSON.parse(result.stdout).checks).toContainEqual(
      expect.objectContaining({ id: "APP003", severity: "error" }),
    );
  }, 20_000);
});
