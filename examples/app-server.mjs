#!/usr/bin/env node

import {
  registerAppResource,
  registerAppTool,
  RESOURCE_MIME_TYPE,
} from "@modelcontextprotocol/ext-apps/server";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};

const variant = option("--variant", "good");
const transportKind = option("--transport", "stdio");
const requestedPort = Number(option("--port", "3210"));
const canonicalUri = "ui://weather/dashboard.html";
const toolUri =
  variant === "bad-uri" ? "https://example.test/not-an-app" : canonicalUri;

const appHtml = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Weather pulse</title>
  <style>
    :root { color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; color: #e9f2ff; background: radial-gradient(circle at 80% 15%, #164e63, transparent 42%), #07111f; }
    main { display: grid; gap: 18px; padding: 32px; }
    .eyebrow { color: #67e8f9; font: 700 11px/1 ui-monospace, monospace; letter-spacing: .16em; text-transform: uppercase; }
    h1 { margin: 0; font-size: clamp(30px, 7vw, 56px); letter-spacing: -.045em; }
    .temp { color: #fde68a; font: 700 clamp(48px, 12vw, 88px)/1 ui-monospace, monospace; }
    .meta { display: flex; gap: 10px; color: #9fb2c8; }
    button { justify-self: start; border: 1px solid #2dd4bf; border-radius: 999px; padding: 9px 15px; color: #ccfbf1; background: #0f766e33; font-weight: 700; cursor: pointer; }
  </style>
</head>
<body>
  <main>
    <span class="eyebrow">MCP APP / LIVE FIXTURE</span>
    <h1 id="city">Waiting for tool input</h1>
    <div class="temp" id="temperature">--°</div>
    <div class="meta"><span>Clear</span><span>·</span><span>42% humidity</span></div>
    <button id="details" type="button">Open forecast notes</button>
  </main>
  <script>
    (() => {
      let nextId = 10;
      const send = (message) => window.parent.postMessage(message, "*");
      const request = (method, params) => send({ jsonrpc: "2.0", id: nextId++, method, params });
      window.addEventListener("message", (event) => {
        if (event.source !== window.parent || !event.data || event.data.jsonrpc !== "2.0") return;
        const message = event.data;
        if (message.id === 1 && message.result) {
          send({ jsonrpc: "2.0", method: "ui/notifications/initialized", params: {} });
          send({ jsonrpc: "2.0", method: "ui/notifications/size-changed", params: { width: 620, height: ${variant === "resize-overflow" ? "100000" : "430"} } });
        }
        if (message.method === "ui/notifications/tool-input") {
          document.querySelector("#city").textContent = message.params.arguments?.city ?? "Unknown city";
        }
        if (message.method === "ui/notifications/tool-result") {
          const text = message.params.content?.find((item) => item.type === "text")?.text ?? "--";
          document.querySelector("#temperature").textContent = text;
        }
      });
      document.querySelector("#details").addEventListener("click", () => request("ui/open-link", { url: "${variant === "navigation-escape" ? "javascript:alert(document.domain)" : "https://example.test/weather-notes"}" }));
      send({
        jsonrpc: "2.0",
        id: 1,
        method: "ui/initialize",
        params: {
          appInfo: { name: "weather-pulse-fixture", version: "0.1.0" },
          appCapabilities: { availableDisplayModes: ["inline", "fullscreen"] },
          protocolVersion: "2026-01-26"
        }
      });
    })();
  </script>
</body>
</html>`;

function createServer() {
  const server = new McpServer({
    name: variant === "good" ? "weather-fixture" : `weather-fixture-${variant}`,
    version: "0.1.0",
  });

  registerAppTool(
    server,
    "show-weather",
    {
      title: "Show weather",
      description: "Render the deterministic weather fixture.",
      inputSchema: { city: z.string().min(1) },
      _meta: { ui: { resourceUri: toolUri, visibility: ["model", "app"] } },
    },
    async ({ city }) => ({
      content: [
        {
          type: "text",
          text: variant === "tool-error" ? "unavailable" : "18°",
        },
      ],
      structuredContent: { city, temperatureC: 18, condition: "clear" },
      isError: variant === "tool-error",
    }),
  );

  const unsafeCsp =
    variant === "csp-injection" ? ["https://ok.test; script-src *"] : [];
  registerAppResource(
    server,
    "Weather dashboard",
    canonicalUri,
    {
      description: "A deterministic MCP App used by the lab demo.",
      _meta: {
        ui: {
          csp: { connectDomains: unsafeCsp, resourceDomains: [] },
          prefersBorder: true,
        },
      },
    },
    async () => ({
      contents: [
        {
          uri: canonicalUri,
          mimeType: variant === "wrong-mime" ? "text/html" : RESOURCE_MIME_TYPE,
          text: appHtml,
          _meta: {
            ui: {
              csp: { connectDomains: unsafeCsp, resourceDomains: [] },
              prefersBorder: true,
            },
          },
        },
      ],
    }),
  );

  return server;
}

async function runStdio() {
  const server = createServer();
  await server.connect(new StdioServerTransport());
}

async function runHttp() {
  const app = createMcpExpressApp();
  app.post("/mcp", async (request, response) => {
    const server = createServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });
    response.on("close", () => {
      void transport.close();
      void server.close();
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(request, response, request.body);
    } catch (error) {
      console.error(error);
      if (!response.headersSent) {
        response.status(500).json({
          jsonrpc: "2.0",
          id: null,
          error: { code: -32603, message: "Fixture server failure" },
        });
      }
    }
  });
  app.get("/mcp", (_request, response) => response.status(405).end());
  app.delete("/mcp", (_request, response) => response.status(405).end());

  const listener = app.listen(requestedPort, "127.0.0.1", () => {
    const address = listener.address();
    const port =
      typeof address === "object" && address ? address.port : requestedPort;
    console.error(`MCP_FIXTURE_READY http://127.0.0.1:${port}/mcp`);
  });
}

if (transportKind === "http") {
  await runHttp();
} else {
  await runStdio();
}
