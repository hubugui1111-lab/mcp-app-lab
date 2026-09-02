import { expect, test } from "@playwright/test";

test("renders, exercises, traces, and screenshots the fixture App", async ({
  page,
}) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "MCP App Lab" }),
  ).toBeVisible();
  await expect(page.getByText("weather-fixture")).toBeVisible();
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
