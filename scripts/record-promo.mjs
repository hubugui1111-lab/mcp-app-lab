import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "@playwright/test";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const tsxCli = resolve(repositoryRoot, "node_modules/tsx/dist/cli.mjs");
const sourceCli = resolve(repositoryRoot, "src/node/cli.ts");
const goodUrl = "http://127.0.0.1:4273";
const badUrl = "http://127.0.0.1:4283";
const outputDirectory = resolve(repositoryRoot, ".artifacts/promo");

const delay = (milliseconds) =>
  new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));

async function waitForHealth(url) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // The local fixture is still starting.
    }
    await delay(100);
  }
  throw new Error("Timed out waiting for " + url);
}

function startFixture(config, port, sandboxPort) {
  const child = spawn(
    process.execPath,
    [
      tsxCli,
      sourceCli,
      "dev",
      "--config",
      config,
      "--port",
      String(port),
      "--sandbox-port",
      String(sandboxPort),
    ],
    {
      cwd: repositoryRoot,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    },
  );
  child.stdout.on("data", (chunk) => process.stdout.write(chunk));
  child.stderr.on("data", (chunk) => process.stderr.write(chunk));
  return child;
}

async function stopFixture(child) {
  if (child.exitCode !== null) return;
  child.kill("SIGTERM");
  await Promise.race([once(child, "exit"), delay(5_000)]);
}

async function withFixtures(callback) {
  const goodFixture = startFixture("examples/good.config.json", 4273, 4274);
  const badFixture = startFixture("fixtures/wrong-mime.json", 4283, 4284);
  try {
    await Promise.all([
      waitForHealth(goodUrl + "/api/health"),
      waitForHealth(badUrl + "/api/health"),
    ]);
    return await callback();
  } finally {
    await Promise.all([stopFixture(goodFixture), stopFixture(badFixture)]);
  }
}

async function inspectPage(page, url) {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "MCP App Lab" }).waitFor();
  await page.waitForTimeout(1_500);

  for (const frame of page.frames()) {
    const elements = await frame.evaluate(() =>
      Array.from(
        document.querySelectorAll(
          "input, select, textarea, button, a, [contenteditable]",
        ),
      )
        .filter((element) => element.getClientRects().length > 0)
        .map((element) => ({
          tag: element.tagName,
          type: element.getAttribute("type") ?? "",
          placeholder: element.getAttribute("placeholder") ?? "",
          text: element.textContent?.trim().slice(0, 80) ?? "",
          ariaLabel: element.getAttribute("aria-label") ?? "",
          title: element.getAttribute("title") ?? "",
          value:
            element instanceof HTMLInputElement ||
            element instanceof HTMLTextAreaElement ||
            element instanceof HTMLSelectElement
              ? element.value
              : "",
        })),
    );
    console.log(
      JSON.stringify({ page: url, frame: frame.url(), elements }, null, 2),
    );
  }
}

async function discover() {
  await withFixtures(async () => {
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage({
        viewport: { width: 1600, height: 900 },
      });
      await inspectPage(page, goodUrl);
      await inspectPage(page, badUrl);
    } finally {
      await browser.close();
    }
  });
}

async function ensureVisible(page, locator, label) {
  const visible = await locator.isVisible().catch(() => false);
  if (visible) {
    console.log('REHEARSAL OK: "' + label + '"');
    return true;
  }

  console.error('REHEARSAL FAIL: "' + label + '"');
  const visibleElements = await page.evaluate(() =>
    Array.from(document.querySelectorAll("button, input, select, textarea, a"))
      .filter((element) => element.getClientRects().length > 0)
      .map(
        (element) =>
          element.tagName +
          ' "' +
          (element.textContent?.trim().slice(0, 40) ?? "") +
          '"',
      )
      .join("\n  "),
  );
  console.error("  Visible elements:\n  " + visibleElements);
  return false;
}

async function rehearse() {
  await withFixtures(async () => {
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage({
        viewport: { width: 1600, height: 900 },
      });

      await page.goto(badUrl, { waitUntil: "domcontentloaded" });
      await page.getByRole("heading", { name: "MCP App Lab" }).waitFor();
      const badChecks = await Promise.all([
        ensureVisible(
          page,
          page.getByRole("status").getByText("1 errors"),
          "bad fixture error count",
        ),
        ensureVisible(
          page,
          page.locator(".finding-error").first(),
          "APP003 MIME finding",
        ),
      ]);

      await page.goto(goodUrl, { waitUntil: "domcontentloaded" });
      await page.getByRole("heading", { name: "MCP App Lab" }).waitFor();
      const sandboxFrame = page.frameLocator('iframe[title="MCP App sandbox"]');
      const appFrame = sandboxFrame.frameLocator(
        'iframe[title="MCP App view"]',
      );
      const goodChecks = await Promise.all([
        ensureVisible(
          page,
          page.getByLabel("Tool arguments"),
          "tool arguments",
        ),
        ensureVisible(
          page,
          page.getByRole("button", { name: "Run tool" }),
          "run tool button",
        ),
        ensureVisible(
          page,
          page.getByRole("heading", { name: "Conformance" }),
          "conformance panel",
        ),
        ensureVisible(
          page,
          page.getByRole("heading", { name: "Protocol trace" }),
          "protocol trace",
        ),
        ensureVisible(
          page,
          page.getByRole("link", { name: /Export recording/u }),
          "recording export",
        ),
      ]);
      if (![...badChecks, ...goodChecks].every(Boolean)) {
        throw new Error("Rehearsal selector check failed");
      }

      await page.getByLabel("Tool arguments").fill('{"city":"Beijing"}');
      await page.getByRole("button", { name: "Run tool" }).click();
      await appFrame.getByRole("heading", { name: "Beijing" }).waitFor();
      await page.getByText("tools/call").last().waitFor();
      await page.getByRole("status").getByText("0 errors").waitFor();
      console.log("REHEARSAL PASSED: complete bad-to-good story verified");
    } finally {
      await browser.close();
    }
  });
}

async function injectDemoChrome(page) {
  await page.evaluate(() => {
    if (document.querySelector("#promo-style")) return;

    const style = document.createElement("style");
    style.id = "promo-style";
    style.textContent =
      '#promo-cursor{position:fixed;z-index:1000002;pointer-events:none;width:30px;height:30px;left:80px;top:90px;transition:left .08s linear,top .08s linear;filter:drop-shadow(0 3px 5px rgba(0,0,0,.55))}#promo-subtitle{position:fixed;z-index:1000001;left:50%;bottom:24px;transform:translateX(-50%);min-width:560px;max-width:960px;padding:13px 28px 12px;border:1px solid rgba(94,234,212,.55);border-radius:14px;background:rgba(3,12,24,.90);box-shadow:0 18px 50px rgba(0,0,0,.45);text-align:center;pointer-events:none;opacity:0;transition:opacity .25s ease;font-family:"Microsoft YaHei","Segoe UI",sans-serif}#promo-subtitle strong{display:block;color:#fff;font-size:21px;line-height:1.35}#promo-subtitle span{display:block;margin-top:3px;color:#7dd3fc;font-size:13px;letter-spacing:.35px}#promo-focus{position:fixed;z-index:1000000;pointer-events:none;border:3px solid #5eead4;border-radius:12px;box-shadow:0 0 0 9999px rgba(2,8,18,.18),0 0 30px rgba(45,212,191,.55);opacity:0;transition:all .35s ease}';
    document.head.append(style);

    const cursor = document.createElement("div");
    cursor.id = "promo-cursor";
    cursor.innerHTML =
      '<svg width="30" height="30" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M5 3L19 12L12 13L9 20L5 3Z" fill="white" stroke="#020617" stroke-width="1.7" stroke-linejoin="round"/></svg>';
    document.body.append(cursor);

    const subtitle = document.createElement("div");
    subtitle.id = "promo-subtitle";
    const chinese = document.createElement("strong");
    chinese.id = "promo-subtitle-zh";
    const english = document.createElement("span");
    english.id = "promo-subtitle-en";
    subtitle.append(chinese, english);
    document.body.append(subtitle);

    const focus = document.createElement("div");
    focus.id = "promo-focus";
    document.body.append(focus);

    document.addEventListener("mousemove", (event) => {
      cursor.style.left = event.clientX + "px";
      cursor.style.top = event.clientY + "px";
    });
  });
}

async function showSubtitle(page, chinese, english, milliseconds) {
  await page.evaluate(
    ({ chineseText, englishText }) => {
      const subtitle = document.querySelector("#promo-subtitle");
      const chineseElement = document.querySelector("#promo-subtitle-zh");
      const englishElement = document.querySelector("#promo-subtitle-en");
      if (
        !(subtitle instanceof HTMLElement) ||
        !(chineseElement instanceof HTMLElement) ||
        !(englishElement instanceof HTMLElement)
      )
        return;
      chineseElement.textContent = chineseText;
      englishElement.textContent = englishText;
      subtitle.style.opacity = "1";
    },
    { chineseText: chinese, englishText: english },
  );
  await page.waitForTimeout(milliseconds);
}

async function hideSubtitle(page) {
  await page.evaluate(() => {
    const subtitle = document.querySelector("#promo-subtitle");
    if (subtitle instanceof HTMLElement) subtitle.style.opacity = "0";
  });
  await page.waitForTimeout(350);
}

async function moveTo(page, locator, label) {
  const visible = await locator.isVisible().catch(() => false);
  if (!visible)
    throw new Error('Recording target not visible: "' + label + '"');
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  if (!box) throw new Error('Recording target has no box: "' + label + '"');
  await page.mouse.move(
    box.x + box.width / 2,
    box.y + Math.min(box.height / 2, 80),
    { steps: 20 },
  );
  await page.waitForTimeout(500);
}

async function focusOn(page, locator, label, color = "#5eead4") {
  await moveTo(page, locator, label);
  const box = await locator.boundingBox();
  if (!box) throw new Error('Focus target has no box: "' + label + '"');
  await page.evaluate(
    ({ rectangle, focusColor }) => {
      const focus = document.querySelector("#promo-focus");
      if (!(focus instanceof HTMLElement)) return;
      focus.style.left = Math.max(8, rectangle.x - 8) + "px";
      focus.style.top = Math.max(8, rectangle.y - 8) + "px";
      focus.style.width = rectangle.width + 16 + "px";
      focus.style.height = rectangle.height + 16 + "px";
      focus.style.borderColor = focusColor;
      focus.style.opacity = "1";
    },
    { rectangle: box, focusColor: color },
  );
}

async function clearFocus(page) {
  await page.evaluate(() => {
    const focus = document.querySelector("#promo-focus");
    if (focus instanceof HTMLElement) focus.style.opacity = "0";
  });
  await page.waitForTimeout(350);
}

async function moveAndClick(page, locator, label) {
  await moveTo(page, locator, label);
  await locator.click();
  await page.waitForTimeout(900);
}

async function typeSlowly(page, locator, text, label) {
  await moveAndClick(page, locator, label);
  await locator.fill("");
  await locator.pressSequentially(text, { delay: 45 });
  await page.waitForTimeout(800);
}

async function showCard(page, content, milliseconds, keep = false) {
  await page.evaluate((card) => {
    const previous = document.querySelector("#promo-card");
    previous?.remove();
    const layer = document.createElement("div");
    layer.id = "promo-card";
    layer.style.cssText =
      'position:fixed;inset:0;z-index:1000010;display:grid;place-items:center;padding:70px;background:radial-gradient(circle at 74% 28%,rgba(8,145,178,.30),transparent 34%),linear-gradient(145deg,rgba(2,8,23,.98),rgba(4,18,34,.96));font-family:"Microsoft YaHei","Segoe UI",sans-serif;color:white;text-align:center;opacity:0;transition:opacity .45s ease';
    const contentBox = document.createElement("div");
    contentBox.style.cssText = "max-width:1080px";
    const eyebrow = document.createElement("p");
    eyebrow.textContent = card.eyebrow;
    eyebrow.style.cssText =
      "margin:0 0 20px;color:#5eead4;font:700 16px/1.2 ui-monospace,monospace;letter-spacing:4px";
    const title = document.createElement("h2");
    title.textContent = card.title;
    title.style.cssText =
      "margin:0;font-size:70px;line-height:1.12;letter-spacing:-2px";
    const subtitle = document.createElement("p");
    subtitle.textContent = card.subtitle;
    subtitle.style.cssText =
      "margin:22px 0 0;color:#bae6fd;font-size:24px;line-height:1.5";
    const detail = document.createElement("code");
    detail.textContent = card.detail;
    detail.style.cssText =
      "display:inline-block;margin-top:34px;padding:13px 20px;border:1px solid rgba(94,234,212,.55);border-radius:10px;background:rgba(15,23,42,.75);color:#f8fafc;font-size:17px";
    contentBox.append(eyebrow, title, subtitle, detail);
    layer.append(contentBox);
    document.body.append(layer);
    requestAnimationFrame(() => {
      layer.style.opacity = "1";
    });
  }, content);
  await page.waitForTimeout(milliseconds);
  if (keep) return;
  await page.evaluate(() => {
    const card = document.querySelector("#promo-card");
    if (card instanceof HTMLElement) card.style.opacity = "0";
  });
  await page.waitForTimeout(500);
  await page.evaluate(() => document.querySelector("#promo-card")?.remove());
}

async function recordStory(page) {
  await page.goto(badUrl, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "MCP App Lab" }).waitFor();
  await page.getByRole("status").getByText("1 errors").waitFor();
  await injectDemoChrome(page);
  await showCard(
    page,
    {
      eyebrow: "OPEN SOURCE · MCP APPS",
      title: "能显示，不等于没问题",
      subtitle: "Make MCP App compatibility failures visible.",
      detail: "github.com/hubugui1111-lab/mcp-app-lab",
    },
    3_800,
  );

  const badStatus = page.getByRole("status").getByText("1 errors");
  await focusOn(page, badStatus, "bad fixture error count", "#fb7185");
  await showSubtitle(
    page,
    "这个 App 仍然能显示，但它已经违反协议",
    "It renders—even while violating the contract.",
    3_300,
  );
  const mimeFinding = page.locator(".finding-error").first();
  await focusOn(page, mimeFinding, "APP003 MIME finding", "#fb7185");
  await showSubtitle(
    page,
    "错误被直接定位为 APP003：MIME 不精确",
    "APP003 pinpoints the incorrect MCP Apps MIME.",
    4_200,
  );
  await clearFocus(page);
  await hideSubtitle(page);

  await showCard(
    page,
    {
      eyebrow: "REAL SERVER · REAL BOUNDARIES",
      title: "从一次真实调用开始",
      subtitle: "stdio / HTTP · two origins · double iframe",
      detail: "No credentials enter the browser sandbox",
    },
    2_500,
  );

  await page.goto(goodUrl, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "MCP App Lab" }).waitFor();
  const sandboxFrame = page.frameLocator('iframe[title="MCP App sandbox"]');
  const appFrame = sandboxFrame.frameLocator('iframe[title="MCP App view"]');
  await appFrame
    .getByRole("heading", { name: "Waiting for tool input" })
    .waitFor();
  await injectDemoChrome(page);

  await focusOn(page, page.locator(".frame-chrome"), "sandboxed App");
  await showSubtitle(
    page,
    "真实 MCP Server，运行在双源双 iframe 沙箱中",
    "A real MCP server inside a two-origin double iframe.",
    4_000,
  );
  await focusOn(
    page,
    page.getByRole("heading", { name: "Conformance" }),
    "conformance panel",
  );
  await showSubtitle(
    page,
    "资源、CSP、消息来源和能力声明同时接受检查",
    "Resources, CSP, origins, and capabilities are checked.",
    3_800,
  );
  await clearFocus(page);
  await hideSubtitle(page);

  const argumentsField = page.getByLabel("Tool arguments");
  await showSubtitle(
    page,
    "修改输入，然后运行一次真实 Tool Call",
    "Change the input, then run a real tool call.",
    1_500,
  );
  await typeSlowly(
    page,
    argumentsField,
    '{"city":"Beijing"}',
    "tool arguments",
  );
  await moveAndClick(
    page,
    page.getByRole("button", { name: "Run tool" }),
    "run tool",
  );
  await appFrame.getByRole("heading", { name: "Beijing" }).waitFor();
  await page.getByText("tools/call").last().waitFor();

  await focusOn(page, page.locator(".frame-chrome"), "updated App");
  await showSubtitle(
    page,
    "App、结果与 Inspector 同步更新",
    "The App, result, and inspector update together.",
    4_000,
  );
  await focusOn(page, page.locator(".result-block"), "tool result");
  await showSubtitle(
    page,
    "调用结果保持可见，也可以脱敏导出并回放",
    "Results stay visible and can be redacted for replay.",
    3_600,
  );
  await clearFocus(page);
  await hideSubtitle(page);

  await page.evaluate(() =>
    window.scrollTo({
      top: document.documentElement.scrollHeight,
      behavior: "smooth",
    }),
  );
  await page.waitForTimeout(1_500);
  await focusOn(page, page.locator(".trace-pane"), "protocol trace");
  await showSubtitle(
    page,
    "每条 MCP 与 bridge 消息都进入协议轨迹",
    "Every MCP and bridge message remains traceable.",
    4_300,
  );
  await clearFocus(page);
  await hideSubtitle(page);

  await showCard(
    page,
    {
      eyebrow: "MIT · V0.1.1 · 62 TESTS + PLAYWRIGHT",
      title: "几分钟，测试你的 MCP App",
      subtitle: "Debug the App boundary—not only the server.",
      detail: "npm ci  &&  npm run demo",
    },
    6_000,
    true,
  );
}

async function createCover(browser, path) {
  const page = await browser.newPage({
    viewport: { width: 1146, height: 716 },
    deviceScaleFactor: 1,
  });
  try {
    await page.goto(badUrl, { waitUntil: "domcontentloaded" });
    await page.getByRole("status").getByText("1 errors").waitFor();
    await page.evaluate(() => {
      const shade = document.createElement("div");
      shade.style.cssText =
        "position:fixed;inset:0;z-index:999990;pointer-events:none;background:linear-gradient(90deg,rgba(2,8,23,.98) 0%,rgba(2,8,23,.94) 47%,rgba(2,8,23,.28) 72%,rgba(2,8,23,.08) 100%)";
      const copy = document.createElement("div");
      copy.style.cssText =
        'position:fixed;z-index:999991;left:54px;top:48px;width:610px;color:white;font-family:"Microsoft YaHei","Segoe UI",sans-serif;pointer-events:none';
      const eyebrow = document.createElement("p");
      eyebrow.textContent = "OPEN SOURCE · MCP APPS";
      eyebrow.style.cssText =
        "margin:0 0 24px;color:#5eead4;font:700 15px/1 ui-monospace,monospace;letter-spacing:3px";
      const title = document.createElement("h1");
      title.textContent = "MCP App 能跑\n≠ 没问题";
      title.style.cssText =
        "margin:0;white-space:pre-line;font-size:72px;line-height:1.08;letter-spacing:-3px;text-shadow:0 5px 24px rgba(0,0,0,.65)";
      const badge = document.createElement("p");
      badge.textContent = "自动定位兼容性错误 · 双层沙箱 · 协议回放";
      badge.style.cssText =
        "display:inline-block;margin:30px 0 0;padding:12px 18px;border:2px solid #fb7185;border-radius:10px;background:rgba(159,18,57,.35);font-size:19px;font-weight:700";
      const footer = document.createElement("p");
      footer.textContent = "MCP APP LAB  v0.1.1";
      footer.style.cssText =
        "margin:48px 0 0;color:#bae6fd;font:700 18px/1 ui-monospace,monospace;letter-spacing:2px";
      copy.append(eyebrow, title, badge, footer);
      document.body.append(shade, copy);
    });
    await page.screenshot({ path, type: "png" });
  } finally {
    await page.close();
  }
}

function createVoiceover(path) {
  if (process.platform !== "win32") return false;
  const powershell = process.env.MCP_APP_LAB_PWSH ?? "pwsh";
  const script = resolve(repositoryRoot, "scripts/render-promo-voiceover.ps1");
  const result = spawnSync(
    powershell,
    ["-NoProfile", "-File", script, "-OutputPath", path],
    { cwd: repositoryRoot, stdio: "inherit" },
  );
  return result.status === 0;
}

function convertVideo(webmPath, mp4Path, voiceoverPath, hasVoiceover) {
  const videoOptions = [
    "-c:v",
    "libx264",
    "-preset",
    "medium",
    "-crf",
    "20",
    "-vf",
    "scale=1920:1080:flags=lanczos,format=yuv420p",
    "-r",
    "30",
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-ar",
    "48000",
    "-ac",
    "2",
    "-movflags",
    "+faststart",
    "-shortest",
    "-metadata",
    "title=MCP App Lab - compatibility failures made visible",
  ];
  const arguments_ = hasVoiceover
    ? [
        "-y",
        "-i",
        webmPath,
        "-i",
        voiceoverPath,
        "-filter_complex",
        "[1:a]loudnorm=I=-16:LRA=7:TP=-1.5,afade=t=out:st=55.3:d=1.7,adelay=1200|1200,apad=pad_dur=90[voice]",
        "-map",
        "0:v:0",
        "-map",
        "[voice]",
        ...videoOptions,
        mp4Path,
      ]
    : [
        "-y",
        "-i",
        webmPath,
        "-f",
        "lavfi",
        "-i",
        "anullsrc=channel_layout=stereo:sample_rate=48000",
        "-map",
        "0:v:0",
        "-map",
        "1:a:0",
        ...videoOptions,
        mp4Path,
      ];
  const result = spawnSync("ffmpeg", arguments_, {
    cwd: repositoryRoot,
    stdio: "inherit",
  });
  if (result.status !== 0) throw new Error("ffmpeg conversion failed");
}

async function record() {
  await mkdir(outputDirectory, { recursive: true });
  const temporaryVideoDirectory = await mkdtemp(
    resolve(tmpdir(), "mcp-app-lab-promo-"),
  );
  const webmPath = resolve(outputDirectory, "mcp-app-lab-demo.webm");
  const mp4Path = resolve(outputDirectory, "mcp-app-lab-demo.mp4");
  const coverPath = resolve(outputDirectory, "mcp-app-lab-cover.png");
  const voiceoverPath = resolve(outputDirectory, "mcp-app-lab-voiceover.wav");

  try {
    await withFixtures(async () => {
      const browser = await chromium.launch({ headless: true });
      try {
        const context = await browser.newContext({
          viewport: { width: 1600, height: 900 },
          recordVideo: {
            dir: temporaryVideoDirectory,
            size: { width: 1600, height: 900 },
          },
          colorScheme: "dark",
        });
        const page = await context.newPage();
        const video = page.video();
        await recordStory(page);
        await context.close();
        if (!video) throw new Error("Playwright video recorder unavailable");
        await video.saveAs(webmPath);
        await createCover(browser, coverPath);
      } finally {
        await browser.close();
      }
    });

    const hasVoiceover = createVoiceover(voiceoverPath);
    convertVideo(webmPath, mp4Path, voiceoverPath, hasVoiceover);
    console.log(
      JSON.stringify(
        {
          webm: webmPath,
          mp4: mp4Path,
          cover: coverPath,
          voiceover: hasVoiceover ? voiceoverPath : "silent track",
        },
        null,
        2,
      ),
    );
  } finally {
    await rm(temporaryVideoDirectory, { recursive: true, force: true });
  }
}

const mode = process.argv.find((argument) =>
  ["--discover", "--rehearse", "--record"].includes(argument),
);

if (mode === "--discover") await discover();
else if (mode === "--rehearse") await rehearse();
else if (mode === "--record") await record();
else {
  console.error("Choose --discover, --rehearse, or --record.");
  process.exitCode = 2;
}
