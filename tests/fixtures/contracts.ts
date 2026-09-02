export const APP_URI = "ui://weather/dashboard.html";
export const APP_MIME = "text/html;profile=mcp-app";

export const GOOD_HTML = `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8"><title>Weather app</title></head>
  <body><main id="app">Weather ready</main><script>window.__fixtureReady = true;</script></body>
</html>`;

export const goodTool = {
  name: "show-weather",
  description: "Render a weather card for one city.",
  inputSchema: {
    type: "object",
    properties: { city: { type: "string", minLength: 1 } },
    required: ["city"],
    additionalProperties: false,
  },
  _meta: {
    ui: {
      resourceUri: APP_URI,
      visibility: ["model", "app"],
    },
  },
};

export const goodResourceListing = {
  uri: APP_URI,
  name: "Weather dashboard",
  mimeType: APP_MIME,
  _meta: {
    ui: {
      csp: {
        connectDomains: ["https://api.example.test"],
        resourceDomains: ["https://cdn.example.test"],
      },
      prefersBorder: true,
    },
  },
};

export const goodResourceRead = {
  contents: [
    {
      uri: APP_URI,
      mimeType: APP_MIME,
      text: GOOD_HTML,
      _meta: {
        ui: {
          csp: {
            connectDomains: ["https://api.example.test"],
            resourceDomains: ["https://cdn.example.test"],
          },
        },
      },
    },
  ],
};

export const goodContract = {
  tools: [goodTool],
  resources: [goodResourceListing],
  reads: { [APP_URI]: goodResourceRead },
  sandbox: {
    hostOrigin: "http://127.0.0.1:4173",
    sandboxOrigin: "http://127.0.0.1:4174",
    sandboxTokens: ["allow-scripts", "allow-same-origin", "allow-forms"],
  },
};

export const goodSession = {
  schemaVersion: "1.0" as const,
  mode: "live" as const,
  coreProtocolVersion: "2025-11-25",
  protocolEra: "legacy" as const,
  appsProtocolVersion: "2026-01-26",
  server: { name: "weather-fixture", version: "0.1.0" },
  connection: {
    transport: "stdio" as const,
    label: "node examples/app-server.mjs",
  },
  tools: [goodTool],
  resources: [goodResourceListing],
  apps: [
    {
      toolName: goodTool.name,
      resourceUri: APP_URI,
      html: GOOD_HTML,
      mimeType: APP_MIME,
      meta: goodResourceRead.contents[0]._meta.ui,
    },
  ],
  findings: [
    {
      id: "APP001",
      severity: "pass" as const,
      title: "UI resource URI is valid",
      detail: APP_URI,
    },
  ],
  trace: [
    {
      sequence: 1,
      timestamp: "2026-09-02T00:00:00.000Z",
      layer: "mcp" as const,
      direction: "host-to-server" as const,
      method: "tools/list",
      payload: {},
    },
  ],
};
