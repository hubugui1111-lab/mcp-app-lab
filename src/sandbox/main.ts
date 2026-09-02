import {
  buildPermissionsAllow,
  requireLoopbackHttpOrigin,
} from "../core/security.js";
import type { UiPermissions } from "../core/types.js";

const PROXY_READY = "ui/notifications/sandbox-proxy-ready";
const RESOURCE_READY = "ui/notifications/sandbox-resource-ready";
const SAFE_SANDBOX_TOKENS = new Set([
  "allow-scripts",
  "allow-same-origin",
  "allow-forms",
]);

if (window.self === window.top)
  throw new Error("The sandbox proxy must be embedded");

const configuredHostOrigin = new URL(window.location.href).searchParams.get(
  "hostOrigin",
);
const referrerOrigin = document.referrer
  ? new URL(document.referrer).origin
  : undefined;
if (
  configuredHostOrigin &&
  referrerOrigin &&
  requireLoopbackHttpOrigin(configuredHostOrigin) !== referrerOrigin
)
  throw new Error("Configured host origin disagrees with the referrer");
const claimedHostOrigin = configuredHostOrigin ?? referrerOrigin;
if (!claimedHostOrigin)
  throw new Error("The sandbox proxy requires an explicit host origin");
const hostOrigin = requireLoopbackHttpOrigin(claimedHostOrigin);

let isolated = false;
try {
  void window.top?.location.href;
} catch {
  isolated = true;
}
if (!isolated) throw new Error("Sandbox origin isolation self-test failed");

const ownOrigin = window.location.origin;
const inner = document.createElement("iframe");
inner.title = "MCP App view";
inner.style.cssText = "width:100%;height:100%;border:0;display:block";
inner.setAttribute("sandbox", "allow-scripts allow-same-origin allow-forms");
document.body.append(inner);

function setSandbox(value: unknown): void {
  if (typeof value !== "string") return;
  const safe = value
    .split(/\s+/u)
    .filter((token) => SAFE_SANDBOX_TOKENS.has(token))
    .join(" ");
  inner.setAttribute("sandbox", safe || "allow-scripts allow-same-origin");
}

function loadResource(params: Record<string, unknown>): void {
  setSandbox(params.sandbox);
  const permissions = params.permissions as UiPermissions | undefined;
  const allow = buildPermissionsAllow(permissions);
  if (allow) inner.setAttribute("allow", allow);
  if (typeof params.html !== "string") return;
  const target = inner.contentDocument ?? inner.contentWindow?.document;
  if (!target) {
    inner.srcdoc = params.html;
    return;
  }
  target.open();
  target.write(params.html);
  target.close();
}

window.addEventListener("message", (event) => {
  if (event.source === window.parent) {
    if (event.origin !== hostOrigin) return;
    const message = event.data as
      { method?: unknown; params?: unknown } | undefined;
    if (
      message?.method === RESOURCE_READY &&
      typeof message.params === "object" &&
      message.params
    ) {
      loadResource(message.params as Record<string, unknown>);
      return;
    }
    inner.contentWindow?.postMessage(event.data, ownOrigin);
    return;
  }
  if (event.source === inner.contentWindow) {
    if (event.origin !== ownOrigin) return;
    window.parent.postMessage(event.data, hostOrigin);
  }
});

window.parent.postMessage(
  { jsonrpc: "2.0", method: PROXY_READY, params: {} },
  hostOrigin,
);
