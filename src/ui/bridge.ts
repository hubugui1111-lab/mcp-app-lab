import { AppBridge } from "@modelcontextprotocol/ext-apps/app-bridge";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import {
  CallToolResultSchema,
  JSONRPCMessageSchema,
  ListResourcesResultSchema,
  ReadResourceResultSchema,
  type JSONRPCMessage,
} from "@modelcontextprotocol/sdk/types.js";

import {
  assessBridgeMessage,
  clampFrameSize,
  decideOpenLink,
} from "../core/security.js";
import type {
  AppDescriptor,
  SessionSnapshot,
  ToolCallRequest,
  ToolCallResult,
} from "../core/types.js";
import { callTool, readResource, recordBridgeEvent } from "./api.js";

const PROXY_READY = "ui/notifications/sandbox-proxy-ready";
const SANDBOX_TOKENS = "allow-scripts allow-same-origin allow-forms";

class OriginBoundPostMessageTransport implements Transport {
  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: NonNullable<Transport["onmessage"]>;
  #started = false;

  constructor(
    private readonly target: WindowProxy,
    private readonly targetOrigin: string,
  ) {}

  #listener = (event: MessageEvent): void => {
    if (event.source !== this.target || event.origin !== this.targetOrigin)
      return;
    const parsed = JSONRPCMessageSchema.safeParse(event.data);
    if (!parsed.success) {
      this.onerror?.(new Error("Rejected an invalid JSON-RPC bridge message"));
      return;
    }
    this.onmessage?.(parsed.data);
  };

  start(): Promise<void> {
    if (this.#started)
      return Promise.reject(new Error("Bridge transport already started"));
    window.addEventListener("message", this.#listener);
    this.#started = true;
    return Promise.resolve();
  }

  send(message: JSONRPCMessage): Promise<void> {
    this.target.postMessage(message, this.targetOrigin);
    return Promise.resolve();
  }

  close(): Promise<void> {
    if (this.#started) window.removeEventListener("message", this.#listener);
    this.#started = false;
    this.onclose?.();
    return Promise.resolve();
  }
}

function bridgeCorrelationId(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return undefined;
}

export interface AppHostHandle {
  sendToolInput(arguments_: Record<string, unknown>): Promise<void>;
  sendToolResult(result: ToolCallResult): Promise<void>;
  sendToolCancelled(reason: string): Promise<void>;
  close(): Promise<void>;
}

function waitForProxy(
  iframe: HTMLIFrameElement,
  sandboxOrigin: string,
  timeoutMs = 5_000,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      window.removeEventListener("message", listener);
      reject(new Error("Sandbox proxy did not become ready"));
    }, timeoutMs);
    const listener = (event: MessageEvent) => {
      const assessment = assessBridgeMessage({
        sourceMatches: event.source === iframe.contentWindow,
        origin: event.origin,
        expectedOrigin: sandboxOrigin,
        data: event.data,
      });
      if (!assessment.accepted) return;
      const message = event.data as { method?: unknown };
      if (message.method !== PROXY_READY) return;
      window.clearTimeout(timeout);
      window.removeEventListener("message", listener);
      recordBridgeEvent({
        direction: "sandbox-to-host",
        method: PROXY_READY,
        payload: {},
        outcome: "accepted",
      });
      resolve();
    };
    window.addEventListener("message", listener);
  });
}

function appInitialized(bridge: AppBridge, timeoutMs = 5_000): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(
      () => reject(new Error("MCP App initialization timed out")),
      timeoutMs,
    );
    bridge.oninitialized = () => {
      window.clearTimeout(timeout);
      recordBridgeEvent({
        direction: "app-to-host",
        method: "ui/notifications/initialized",
        payload: {},
        outcome: "accepted",
      });
      resolve();
    };
  });
}

export async function mountAppBridge(options: {
  iframe: HTMLIFrameElement;
  app: AppDescriptor;
  session: SessionSnapshot;
  onSize: (height: number) => void;
  onDisplayMode: (mode: "inline" | "fullscreen") => void;
  onLog: (message: string) => void;
}): Promise<AppHostHandle> {
  const { iframe, app, session } = options;
  const sandboxUrl = new URL(
    session.sandboxUrl ?? "http://127.0.0.1:5179/sandbox.html",
  );
  const sandboxOrigin = sandboxUrl.origin;
  sandboxUrl.searchParams.set("hostOrigin", window.location.origin);
  const csp = app.meta?.csp;
  if (csp) sandboxUrl.searchParams.set("csp", JSON.stringify(csp));
  iframe.setAttribute("sandbox", SANDBOX_TOKENS);

  const rawListener = (event: MessageEvent) => {
    if (event.source !== iframe.contentWindow) return;
    const assessment = assessBridgeMessage({
      sourceMatches: true,
      origin: event.origin,
      expectedOrigin: sandboxOrigin,
      data: event.data,
    });
    const message = event.data as
      { method?: unknown; id?: unknown; params?: unknown } | undefined;
    const correlationId = bridgeCorrelationId(message?.id);
    recordBridgeEvent({
      direction: "app-to-host",
      method:
        typeof message?.method === "string"
          ? message.method
          : "invalid-message",
      payload: message?.params ?? event.data,
      ...(correlationId === undefined ? {} : { correlationId }),
      outcome: assessment.accepted ? "accepted" : "rejected",
    });
  };
  window.addEventListener("message", rawListener);

  const proxyReady = waitForProxy(iframe, sandboxOrigin);
  iframe.src = sandboxUrl.href;
  await proxyReady;

  const policy = session.policy ?? {
    openLinks: "deny",
    allowedLinkOrigins: [],
    maxFrameHeight: 1_200,
    maxFrameWidth: 1_600,
  };
  const bridge = new AppBridge(
    null,
    { name: "mcp-app-lab", version: "0.1.0" },
    {
      openLinks: {},
      logging: {},
      serverTools: {},
      serverResources: {},
      updateModelContext: { text: {}, structuredContent: {} },
      message: { text: {}, structuredContent: {} },
    },
    {
      hostContext: {
        theme: "dark",
        platform: "web",
        locale: navigator.language,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        displayMode: "inline",
        availableDisplayModes: ["inline", "fullscreen"],
        containerDimensions: {
          maxHeight: policy.maxFrameHeight,
          maxWidth: policy.maxFrameWidth,
        },
      },
    },
  );

  bridge.oncalltool = async (params) => {
    const request: ToolCallRequest = {
      name: params.name,
      ...(params.arguments ? { arguments: params.arguments } : {}),
    };
    return CallToolResultSchema.parse(await callTool(request));
  };
  bridge.onlistresources = () =>
    Promise.resolve(
      ListResourcesResultSchema.parse({ resources: session.resources }),
    );
  bridge.onreadresource = async (params) =>
    ReadResourceResultSchema.parse(await readResource(params.uri));
  bridge.onopenlink = ({ url }: { url: string }) => {
    const decision = decideOpenLink(url, {
      mode: policy.openLinks,
      origins: policy.allowedLinkOrigins,
    });
    recordBridgeEvent({
      direction: "app-to-host",
      method: "ui/open-link:policy",
      payload: decision,
      outcome: decision.allowed ? "accepted" : "rejected",
    });
    if (decision.allowed && decision.normalizedUrl) {
      window.open(decision.normalizedUrl, "_blank", "noopener,noreferrer");
    }
    return Promise.resolve({});
  };
  bridge.onloggingmessage = ({ level, logger, data }) => {
    options.onLog(`[${logger ?? "app"}/${level}] ${JSON.stringify(data)}`);
  };
  bridge.onmessage = (params: unknown) => {
    options.onLog(`[message] ${JSON.stringify(params)}`);
    return Promise.resolve({});
  };
  bridge.onupdatemodelcontext = (params: unknown) => {
    options.onLog(`[context blocked] ${JSON.stringify(params)}`);
    return Promise.resolve({});
  };
  bridge.onsizechange = ({
    width,
    height,
  }: {
    width?: number;
    height?: number;
  }) => {
    const size = clampFrameSize(
      {
        ...(width === undefined ? {} : { width }),
        ...(height === undefined ? {} : { height }),
      },
      {
        maxWidth: policy.maxFrameWidth,
        maxHeight: policy.maxFrameHeight,
      },
    );
    if (size.height) options.onSize(size.height);
    recordBridgeEvent({
      direction: "app-to-host",
      method: "ui/notifications/size-changed:policy",
      payload: size,
      outcome: size.clamped ? "rejected" : "accepted",
    });
  };
  bridge.onrequestdisplaymode = async ({
    mode,
  }: {
    mode: "inline" | "fullscreen" | "pip";
  }) => {
    const accepted = mode === "fullscreen" ? "fullscreen" : "inline";
    options.onDisplayMode(accepted);
    recordBridgeEvent({
      direction: "app-to-host",
      method: "ui/request-display-mode:policy",
      payload: { requested: mode, accepted },
      outcome: mode === accepted ? "accepted" : "rejected",
    });
    await bridge.sendHostContextChange({ displayMode: accepted });
    return { mode: accepted };
  };

  const initialized = appInitialized(bridge);
  const contentWindow = iframe.contentWindow;
  if (!contentWindow) throw new Error("Sandbox iframe has no content window");
  const transport = new OriginBoundPostMessageTransport(
    contentWindow,
    sandboxOrigin,
  );
  await bridge.connect(transport);
  const sandboxResource: Parameters<AppBridge["sendSandboxResourceReady"]>[0] =
    {
      html: app.html,
      sandbox: SANDBOX_TOKENS,
      ...(csp ? { csp } : {}),
      ...(app.meta?.permissions ? { permissions: app.meta.permissions } : {}),
    };
  await bridge.sendSandboxResourceReady(sandboxResource);
  recordBridgeEvent({
    direction: "host-to-sandbox",
    method: "ui/notifications/sandbox-resource-ready",
    payload: { resourceUri: app.resourceUri, mimeType: app.mimeType },
    outcome: "accepted",
  });
  await initialized;

  return {
    async sendToolInput(arguments_) {
      recordBridgeEvent({
        direction: "host-to-app",
        method: "ui/notifications/tool-input",
        payload: { arguments: arguments_ },
        outcome: "accepted",
      });
      await bridge.sendToolInput({ arguments: arguments_ });
    },
    async sendToolResult(result) {
      recordBridgeEvent({
        direction: "host-to-app",
        method: "ui/notifications/tool-result",
        payload: result,
        outcome: result.isError ? "error" : "accepted",
      });
      await bridge.sendToolResult(CallToolResultSchema.parse(result));
    },
    async sendToolCancelled(reason) {
      await bridge.sendToolCancelled({ reason });
    },
    async close() {
      window.removeEventListener("message", rawListener);
      try {
        await bridge.teardownResource({});
      } catch {
        // A fixture or broken App may not implement graceful teardown.
      }
      await transport.close();
    },
  };
}
