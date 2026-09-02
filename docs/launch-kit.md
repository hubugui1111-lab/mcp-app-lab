# MCP App Lab launch kit

This file contains copy-ready launch material. It is not an instruction to mass-post. Adapt each message to the community, answer replies, and never buy stars or send generic bulk outreach.

## Positioning

One sentence:

> MCP App Lab is a local workbench that renders MCP Apps in a real two-origin sandbox and turns conformance, bridge, policy, replay, and visual failures into repeatable CI evidence.

Short description:

> Debug an MCP App as a system, not just an HTML file: connect over stdio or Streamable HTTP, inspect 13 App contracts, trace the MCP/iframe bridge, export deterministic recordings, and run nine adversarial regressions.

GitHub description (under 160 characters):

> Local MCP Apps workbench for sandbox rendering, conformance checks, protocol traces, deterministic replay, adversarial fixtures, and visual CI.

## Evidence to lead with

- `assets/promo-cover.png`: the 1146×716 cover for the 58-second narrated launch video.
- `mcp-app-lab-demo.mp4`: a 1920×1080 H.264/AAC recording of the real bad-to-good workflow, published with the v0.1.1 GitHub release.
- `assets/demo.png`: an intentional MIME failure, with the App, `APP003` verdict, and protocol trace visible together.
- `assets/workbench.png`: successful tool interaction through the real double-iframe path.
- `npm run demo`: reproducible local demo using a real stdio MCP server.
- `npm run verify`: non-browser quality gate.
- `npm run test:e2e`: Chromium interaction and visual gate.

Do not claim production-grade isolation, official certification, universal client compatibility, or npm availability unless those facts are independently true at publication time.

## Video package

The launch video is 58 seconds, uses the real local fixtures, includes a visible cursor, bilingual burned-in captions, and an original synthesized Chinese narration. It contains no third-party music or stock footage.

Windows uses an installed Chinese System.Speech voice; other platforms retain the captions and receive a silent audio track.

Regenerate it only after the discovery and rehearsal gates pass:

```bash
npm run demo:video:discover
npm run demo:video:rehearse
npm run demo:video
```

### Bilibili

Title:

> MCP App 能跑≠没问题：我做了个兼容性与沙箱测试实验室

Description:

> 一个 MCP Server 能正常调用工具，不代表它的交互式 App 在 Host 中就是兼容且安全的。
>
> MCP App Lab 会连接真实的 stdio / Streamable HTTP Server，把 App 放进双源双 iframe 沙箱，并在同一个工作台展示调用结果、13 项确定性检查与完整协议轨迹。视频里的 APP003 是一个真实故障夹具：页面仍能显示，但 MIME 已违反 MCP Apps 约定。
>
> 项目地址：https://github.com/hubugui1111-lab/mcp-app-lab
>
> 最小运行：`git clone` 后执行 `npm ci && npm run demo`。
>
> 当前版本 v0.1.1，MIT 开源。这是独立开发者工具，不是官方 MCP 认证套件。

Tags: `MCP` · `开源` · `开发者工具` · `TypeScript` · `AI编程`

Pinned comment:

> 项目和完整复现步骤：https://github.com/hubugui1111-lab/mcp-app-lab 。如果你正在开发公开的 MCP App，欢迎带上具体 Server/版本和可复现现象提 Issue；最想收集的是“普通 MCP Inspector 看不明显，但进入 App Host 后才出现”的问题。

## GitHub release copy

### Title

MCP App Lab v0.1.1 — see the bridge failure, keep the evidence

### Body

MCP App Lab is an open-source local workbench for debugging interactive MCP Apps. It connects to real stdio or Streamable HTTP servers, renders the App through a distinct-origin double iframe, checks 13 resource/sandbox contracts, and records MCP, bridge, sandbox, and policy events in one trace.

The project includes deterministic recording/replay, nine adversarial fixtures, a machine-readable CLI gate, strict TypeScript and coverage thresholds, package-install smoke tests, real Chromium visual regressions, and bounded host/sandbox request rates.

Try the included fixture with `npm ci && npm run demo`, then open `http://127.0.0.1:5178`.

## 中文社区短帖

### HelloGitHub / LINUX DO

标题：开源了一个 MCP App 调试实验室：把 iframe 桥接和兼容性错误直接变成回归测试

正文：

最近做 MCP App 时，我发现“Server 能连上”离“交互 App 在 Host 里稳定工作”还有一整段不好排查的链路：`ui://` 资源、MIME、CSP、双 iframe、postMessage、Host 能力和工具调用任何一处都可能出问题。

于是做了 MCP App Lab。它能连接真实 stdio / Streamable HTTP Server，在两个不同本地源中渲染 App，同时显示 13 项检查和 MCP / bridge / sandbox / policy 四层轨迹。仓库还放了 9 个故意做坏的夹具，并用 Playwright 留下真实视觉回归。

最小运行：`npm ci && npm run demo`。目前是 v0.1.1，重点是可复现和可审查，不是官方认证工具。欢迎拿自己的 App Server 试一下，尤其想知道你们最难定位的是哪一层。

### 小众软件 / Appinn

标题：MCP App Lab：本地可视化检查与回放交互式 MCP App

摘要：

MCP App Lab 是一个开源本地开发工具。它把 MCP Server 的交互页面放进双层、不同源 iframe 中运行，同时给出资源格式、CSP、沙箱和工具 Schema 检查。开发者可以查看完整消息轨迹、导出脱敏记录离线回放，也可以直接运行 9 个错误示例观察 Host 如何拒绝或降级请求。项目默认只监听 127.0.0.1，不存储凭据；功能门禁覆盖 Linux 和 Windows，视觉基线当前以 Windows Chromium 为准。

## English community post

### Show HN / Reddit-style

Title: MCP App Lab — deterministic sandbox, bridge, and visual regressions for MCP Apps

Body:

I built MCP App Lab because an MCP server can pass ordinary tool inspection while its interactive App still fails at the `ui://` resource, MIME, CSP, iframe bridge, or host-policy boundary.

The Lab connects to a real stdio or Streamable HTTP server, renders the App through a two-origin double iframe, and puts 13 conformance checks next to a four-layer protocol trace. Recordings are redacted and replayed offline with exact request matching. The repo also includes nine deliberately broken fixtures and Playwright visual baselines.

The smallest demo is `npm ci && npm run demo`. It is an independent v0.1 developer tool, not an official certification suite. I would especially value examples of App failures that broad MCP inspection did not make obvious.

## Personalized maintainer outreach

Only contact maintainers whose public project actually ships an MCP App. Run their public example first and replace every bracketed field.

> Subject: Reproducible [project] App trace for [specific behavior]
>
> Hi [name] — I tested [exact public example/version] in MCP App Lab and got [one concrete result]. The useful part was [specific trace/finding], not just whether the page rendered. I saved a redacted reproduction at [public issue or gist, only with permission]. If this kind of fixture would help your CI, the project is at [repository]. No action needed; I would be glad to turn [specific behavior] into a small upstream regression if useful.

Never attach private logs, speculate about a vulnerability, or ask for a star.

## Launch sequence

1. Verify the tagged commit, public CI, CodeQL, Gitleaks, dependency audit, package archive, and both README images.
2. Publish the GitHub release with the generated checksum.
3. Submit once to one technically relevant community and remain available for replies.
4. Incorporate concrete onboarding feedback before posting to the next community.
5. Send at most a few individually researched maintainer notes with real reproduction evidence.
6. Track useful outcomes: successful first run, issues with reproducible fixtures, contributors, and retained users. Stars are a discovery signal, not the product metric.
