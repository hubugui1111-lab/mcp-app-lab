import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test } from "@playwright/test";

const repositoryRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const tsxCli = resolve(repositoryRoot, "node_modules/tsx/dist/cli.mjs");
const sourceCli = resolve(repositoryRoot, "src/node/cli.ts");

async function waitForHealth(url: string): Promise<void> {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // The local server is still starting.
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

test("renders, exercises, traces, and screenshots the fixture App", async ({
  page,
}) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "MCP App Lab" }),
  ).toBeVisible();
  await expect(
    page.getByRole("banner").getByText("weather-fixture"),
  ).toBeVisible();
  await page.getByLabel("Tool arguments").fill('{"city":"Changchun"}');
  await page.getByRole("button", { name: "Run tool" }).click();

  const sandboxFrame = page.frameLocator('iframe[title="MCP App sandbox"]');
  const appFrame = sandboxFrame.frameLocator('iframe[title="MCP App view"]');
  await expect(
    appFrame.getByRole("heading", { name: "Changchun" }),
  ).toBeVisible();
  await expect(appFrame.getByText("18°")).toBeVisible();
  await expect(page.getByText("tools/call").last()).toBeVisible();
  await expect(page.getByRole("status")).toContainText("0 errors");

  await expect(page).toHaveScreenshot("mcp-app-lab.png", { fullPage: true });
});

test("layout remains useful on a narrow viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "MCP App Lab" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "App viewport" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Conformance" }),
  ).toBeVisible();
});

test.describe("adversarial fixture", () => {
  let badFixture: ChildProcess;

  test.beforeAll(async () => {
    badFixture = spawn(
      process.execPath,
      [
        tsxCli,
        sourceCli,
        "dev",
        "--config",
        "fixtures/wrong-mime.json",
        "--port",
        "4183",
        "--sandbox-port",
        "4184",
      ],
      {
        cwd: repositoryRoot,
        stdio: "ignore",
        windowsHide: true,
      },
    );
    await waitForHealth("http://127.0.0.1:4183/api/health");
  });

  test.afterAll(async () => {
    if (badFixture.exitCode === null) badFixture.kill("SIGTERM");
    if (badFixture.exitCode === null) await once(badFixture, "exit");
  });

  test("makes an intentional compatibility defect impossible to miss", async ({
    page,
  }) => {
    await page.goto("http://127.0.0.1:4183");

    await expect(page.getByRole("status")).toContainText("1 error");
    await expect(page.getByText(/MCP Apps MIME is not exact/u)).toBeVisible();
    await expect(page).toHaveScreenshot("mcp-app-lab-bad.png", {
      fullPage: true,
    });
  });
});
