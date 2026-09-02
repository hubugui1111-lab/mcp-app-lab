import type { UiCsp, UiPermissions } from "./types.js";

const SAFE_CSP_SOURCE =
  /^(?:https?|wss?):\/\/(?:\*\.)?[a-z0-9.-]+(?::\d{1,5})?$/iu;

export function requireLoopbackHttpOrigin(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Host origin is not a valid URL");
  }
  if (
    url.protocol !== "http:" ||
    !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)
  ) {
    throw new Error(`Refusing non-loopback host origin: ${url.origin}`);
  }
  return url.origin;
}

export interface CspBuildResult {
  header: string;
  rejected: string[];
  accepted: Required<UiCsp>;
}

function sanitizeSources(
  values: string[] | undefined,
  rejected: string[],
): string[] {
  return (values ?? []).filter((value) => {
    const valid = SAFE_CSP_SOURCE.test(value) && !/[\s;'"\\]/u.test(value);
    if (!valid) rejected.push(value);
    return valid;
  });
}

function buildCsp(csp: UiCsp | undefined): CspBuildResult {
  const rejected: string[] = [];
  const accepted = {
    connectDomains: sanitizeSources(csp?.connectDomains, rejected),
    resourceDomains: sanitizeSources(csp?.resourceDomains, rejected),
    frameDomains: sanitizeSources(csp?.frameDomains, rejected),
    baseUriDomains: sanitizeSources(csp?.baseUriDomains, rejected),
  };
  const resources = accepted.resourceDomains.join(" ");
  const connections = accepted.connectDomains.join(" ");
  const frames = accepted.frameDomains.join(" ");
  const bases = accepted.baseUriDomains.join(" ");
  const directives = [
    "default-src 'none'",
    `script-src 'self' 'unsafe-inline'${resources ? ` ${resources}` : ""}`,
    `style-src 'self' 'unsafe-inline'${resources ? ` ${resources}` : ""}`,
    `img-src 'self' data: blob:${resources ? ` ${resources}` : ""}`,
    `font-src 'self' data:${resources ? ` ${resources}` : ""}`,
    `media-src 'self' data: blob:${resources ? ` ${resources}` : ""}`,
    connections ? `connect-src ${connections}` : "connect-src 'none'",
    frames ? `frame-src ${frames}` : "frame-src 'none'",
    "object-src 'none'",
    bases ? `base-uri ${bases}` : "base-uri 'none'",
  ];

  return { header: directives.join("; "), rejected, accepted };
}

export function buildSandboxCsp(): string;
export function buildSandboxCsp(csp: UiCsp): CspBuildResult;
export function buildSandboxCsp(csp?: UiCsp): string | CspBuildResult {
  const result = buildCsp(csp);
  return csp === undefined ? result.header : result;
}

export interface BridgeMessageAssessment {
  accepted: boolean;
  reason:
    "accepted" | "source-mismatch" | "origin-mismatch" | "invalid-jsonrpc";
}

export function assessBridgeMessage(input: {
  sourceMatches: boolean;
  origin: string;
  expectedOrigin: string;
  data: unknown;
}): BridgeMessageAssessment {
  if (!input.sourceMatches)
    return { accepted: false, reason: "source-mismatch" };
  if (input.origin !== input.expectedOrigin)
    return { accepted: false, reason: "origin-mismatch" };
  if (
    typeof input.data !== "object" ||
    input.data === null ||
    !("jsonrpc" in input.data) ||
    input.data.jsonrpc !== "2.0"
  ) {
    return { accepted: false, reason: "invalid-jsonrpc" };
  }
  return { accepted: true, reason: "accepted" };
}

export interface OpenLinkPolicy {
  mode: "deny" | "allowlist";
  origins?: string[];
}

export interface OpenLinkDecision {
  allowed: boolean;
  reason:
    | "allowed"
    | "invalid-url"
    | "unsafe-scheme"
    | "policy-deny"
    | "origin-not-allowed";
  normalizedUrl?: string;
}

export function decideOpenLink(
  value: string,
  policy: OpenLinkPolicy,
): OpenLinkDecision {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return { allowed: false, reason: "invalid-url" };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return { allowed: false, reason: "unsafe-scheme" };
  }
  if (policy.mode === "deny") {
    return { allowed: false, reason: "policy-deny", normalizedUrl: url.href };
  }
  if (!(policy.origins ?? []).includes(url.origin)) {
    return {
      allowed: false,
      reason: "origin-not-allowed",
      normalizedUrl: url.href,
    };
  }
  return { allowed: true, reason: "allowed", normalizedUrl: url.href };
}

export function clampFrameSize(
  requested: { width?: number; height?: number },
  limits: { maxWidth: number; maxHeight: number },
): { width?: number; height?: number; clamped: boolean } {
  const result: { width?: number; height?: number; clamped: boolean } = {
    clamped: false,
  };
  if (requested.width !== undefined) {
    result.width = Math.min(
      limits.maxWidth,
      Math.max(1, Math.round(requested.width)),
    );
    result.clamped ||= result.width !== requested.width;
  }
  if (requested.height !== undefined) {
    result.height = Math.min(
      limits.maxHeight,
      Math.max(1, Math.round(requested.height)),
    );
    result.clamped ||= result.height !== requested.height;
  }
  return result;
}

export function buildPermissionsAllow(
  permissions: UiPermissions | undefined,
): string {
  const entries: string[] = [];
  if (permissions?.camera) entries.push("camera 'self'");
  if (permissions?.microphone) entries.push("microphone 'self'");
  if (permissions?.geolocation) entries.push("geolocation 'self'");
  if (permissions?.clipboardWrite) entries.push("clipboard-write 'self'");
  return entries.join("; ");
}
