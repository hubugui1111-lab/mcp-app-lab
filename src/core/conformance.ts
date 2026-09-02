import { APPS_SPEC_VERSION, CORE_SPEC_VERSION } from "./types.js";
import { buildSandboxCsp } from "./security.js";
import type {
  AppContractInput,
  ConformanceReport,
  Finding,
  ResourceContent,
  ResourceDefinition,
  ResourceUiMeta,
  ToolDefinition,
} from "./types.js";

export const APP_MIME_TYPE = "text/html;profile=mcp-app";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function uiObject(meta: unknown): Record<string, unknown> | undefined {
  if (!isRecord(meta) || !isRecord(meta.ui)) return undefined;
  return meta.ui;
}

export function getToolResourceUri(
  tool: Pick<ToolDefinition, "_meta">,
): string | undefined {
  const nested = uiObject(tool._meta)?.resourceUri;
  if (typeof nested === "string") return nested;
  const legacy = tool._meta?.["ui/resourceUri"];
  return typeof legacy === "string" ? legacy : undefined;
}

export function resolveResourceUiMeta(
  listing: Pick<ResourceDefinition, "_meta"> | undefined,
  content: Pick<ResourceContent, "_meta"> | undefined,
): ResourceUiMeta | undefined {
  const contentUi = uiObject(content?._meta);
  if (contentUi) return contentUi;
  const listingUi = uiObject(listing?._meta);
  return listingUi;
}

function bodyFromContent(content: ResourceContent): string | undefined {
  const hasText = typeof content.text === "string";
  const hasBlob = typeof content.blob === "string";
  if (hasText === hasBlob) return undefined;
  if (hasText) return content.text;
  try {
    return Buffer.from(content.blob ?? "", "base64").toString("utf8");
  } catch {
    return undefined;
  }
}

function validHtml5(html: string): boolean {
  return (
    /^\s*<!doctype html>/iu.test(html) &&
    /<html(?:\s|>)/iu.test(html) &&
    /<head(?:\s|>)/iu.test(html) &&
    /<body(?:\s|>)/iu.test(html)
  );
}

function finding(
  id: string,
  severity: Finding["severity"],
  title: string,
  detail: string,
  remediation?: string,
): Finding {
  return remediation === undefined
    ? { id, severity, title, detail }
    : { id, severity, title, detail, remediation };
}

function originsInResourceAttributes(html: string): Set<string> {
  const origins = new Set<string>();
  const pattern = /\b(?:src|href)\s*=\s*["'](https?:\/\/[^"']+)["']/giu;
  for (const match of html.matchAll(pattern)) {
    try {
      if (match[1]) origins.add(new URL(match[1]).origin);
    } catch {
      // Invalid URLs are diagnosed by the browser; they do not become allowed origins.
    }
  }
  return origins;
}

function inspectAppResource(
  checks: Finding[],
  uri: string,
  listing: ResourceDefinition | undefined,
  content: ResourceContent,
): void {
  if (content.mimeType === APP_MIME_TYPE) {
    checks.push(
      finding("APP003", "pass", "MCP Apps MIME is exact", content.mimeType),
    );
  } else {
    checks.push(
      finding(
        "APP003",
        "error",
        "MCP Apps MIME is not exact",
        `Expected ${APP_MIME_TYPE}; received ${content.mimeType ?? "no MIME type"}`,
        `Return ${APP_MIME_TYPE} from resources/read.`,
      ),
    );
  }

  const html = bodyFromContent(content);
  if (html === undefined) {
    checks.push(
      finding(
        "APP004",
        "error",
        "Resource body is ambiguous",
        `${uri} must contain exactly one of text or blob.`,
        "Return a single UTF-8 text body or one base64 blob.",
      ),
    );
    return;
  }
  checks.push(
    finding("APP004", "pass", "Resource body has one representation", uri),
  );

  checks.push(
    validHtml5(html)
      ? finding("APP005", "pass", "Resource is a complete HTML5 document", uri)
      : finding(
          "APP005",
          "error",
          "Resource is not a complete HTML5 document",
          `${uri} needs a doctype, html, head, and body.`,
        ),
  );

  const meta = resolveResourceUiMeta(listing, content);
  const csp = meta?.csp;
  const cspResult = csp
    ? buildSandboxCsp(csp)
    : { rejected: [], accepted: { resourceDomains: [] } };
  checks.push(
    cspResult.rejected.length === 0
      ? finding("APP006", "pass", "CSP sources are syntactically safe", uri)
      : finding(
          "APP006",
          "error",
          "CSP contains rejected sources",
          cspResult.rejected.join(", "),
          "Use one explicit http(s) or wss origin per CSP entry.",
        ),
  );

  const declared = new Set(cspResult.accepted.resourceDomains);
  const undeclared = [...originsInResourceAttributes(html)].filter(
    (origin) => !declared.has(origin),
  );
  checks.push(
    undeclared.length === 0
      ? finding("APP007", "pass", "Remote resource origins are declared", uri)
      : finding(
          "APP007",
          "error",
          "Remote resource origin is not declared",
          undeclared.join(", "),
          "Add every external script, style, image, font, and media origin to resourceDomains.",
        ),
  );
}

function inspectSandbox(
  checks: Finding[],
  contract: AppContractInput["sandbox"],
): void {
  checks.push(
    contract.hostOrigin !== contract.sandboxOrigin
      ? finding(
          "APP008",
          "pass",
          "Host and sandbox use different origins",
          `${contract.hostOrigin} → ${contract.sandboxOrigin}`,
        )
      : finding(
          "APP008",
          "error",
          "Host and sandbox share an origin",
          contract.hostOrigin,
          "Serve the outer sandbox proxy from a distinct origin.",
        ),
  );

  const tokenSet = new Set(contract.sandboxTokens);
  const required = ["allow-scripts", "allow-same-origin"];
  const missing = required.filter((token) => !tokenSet.has(token));
  checks.push(
    missing.length === 0
      ? finding(
          "APP009",
          "pass",
          "Required sandbox capabilities are present",
          required.join(", "),
        )
      : finding(
          "APP009",
          "error",
          "Required sandbox capabilities are missing",
          missing.join(", "),
        ),
  );

  const escapeTokens = [...tokenSet].filter((token) =>
    ["allow-top-navigation", "allow-popups-to-escape-sandbox"].includes(token),
  );
  checks.push(
    escapeTokens.length === 0
      ? finding(
          "APP010",
          "pass",
          "No sandbox escape tokens are enabled",
          "deny by default",
        )
      : finding(
          "APP010",
          "error",
          "Sandbox enables escape-capable tokens",
          escapeTokens.join(", "),
          "Remove top-navigation and popup escape capabilities.",
        ),
  );
}

export function analyzeAppContract(input: AppContractInput): ConformanceReport {
  const checks: Finding[] = [];
  const resources = new Map(
    input.resources.map((resource) => [resource.uri, resource]),
  );

  for (const tool of input.tools) {
    const uri = getToolResourceUri(tool);
    const validUri = typeof uri === "string" && uri.startsWith("ui://");
    checks.push(
      validUri
        ? finding(
            "APP001",
            "pass",
            "UI resource URI is valid",
            `${tool.name} → ${uri}`,
          )
        : finding(
            "APP001",
            "error",
            "UI resource URI is invalid",
            `${tool.name} → ${uri ?? "missing"}`,
            "Use nested _meta.ui.resourceUri with a ui:// URI.",
          ),
    );

    if (!uri) continue;
    const read = input.reads[uri];
    const content =
      read?.contents.find((candidate) => candidate.uri === uri) ??
      read?.contents[0];
    if (!read || !content) {
      checks.push(
        finding(
          "APP002",
          "error",
          "Linked UI resource cannot be resolved",
          `${tool.name} references ${uri}`,
          "Return the referenced resource from resources/read.",
        ),
      );
      continue;
    }
    checks.push(finding("APP002", "pass", "Linked UI resource resolves", uri));
    inspectAppResource(checks, uri, resources.get(uri), content);

    const nested = uiObject(tool._meta);
    const visibility = nested?.visibility;
    const validVisibility =
      visibility === undefined ||
      (Array.isArray(visibility) &&
        visibility.length > 0 &&
        visibility.every((value) => value === "model" || value === "app"));
    checks.push(
      validVisibility
        ? finding("APP011", "pass", "Tool visibility is valid", tool.name)
        : finding(
            "APP011",
            "error",
            "Tool visibility is invalid",
            tool.name,
            'Use one or both of "model" and "app".',
          ),
    );
  }

  inspectSandbox(checks, input.sandbox);
  const summary = {
    passes: checks.filter((check) => check.severity === "pass").length,
    warnings: checks.filter((check) => check.severity === "warning").length,
    errors: checks.filter((check) => check.severity === "error").length,
  };
  return {
    specVersions: { core: CORE_SPEC_VERSION, apps: APPS_SPEC_VERSION },
    checks,
    summary,
  };
}
