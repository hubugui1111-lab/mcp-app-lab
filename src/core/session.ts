import { connectionLabel, parseLabConfig } from "./config.js";
import {
  analyzeAppContract,
  getToolResourceUri,
  resolveResourceUiMeta,
} from "./conformance.js";
import type { LabClient } from "./client.js";
import { APPS_SPEC_VERSION, RECORDING_SCHEMA_VERSION } from "./types.js";
import type {
  AppContractInput,
  AppDescriptor,
  ReadResourceResult,
  ResourceContent,
  SessionSnapshot,
  ToolDefinition,
  TraceEvent,
} from "./types.js";

function decodeContent(content: ResourceContent): string | undefined {
  if (typeof content.text === "string" && content.blob === undefined)
    return content.text;
  if (typeof content.blob === "string" && content.text === undefined) {
    return Buffer.from(content.blob, "base64").toString("utf8");
  }
  return undefined;
}

function makeDiscoveryTrace(now: () => Date): TraceEvent[] {
  const methods = ["initialize", "tools/list", "resources/list"];
  return methods.flatMap((method, index) => [
    {
      sequence: index * 2 + 1,
      timestamp: now().toISOString(),
      layer: "mcp" as const,
      direction: "host-to-server" as const,
      method,
      payload: {},
      outcome: "accepted" as const,
    },
    {
      sequence: index * 2 + 2,
      timestamp: now().toISOString(),
      layer: "mcp" as const,
      direction: "server-to-host" as const,
      method: `${method}:result`,
      payload: {},
      outcome: "accepted" as const,
    },
  ]);
}

function linkedUris(tools: readonly ToolDefinition[]): string[] {
  return [
    ...new Set(
      tools
        .map((tool) => getToolResourceUri(tool))
        .filter((uri): uri is string => uri !== undefined),
    ),
  ];
}

export async function inspectServer(
  client: LabClient,
  configValue: unknown,
  options: {
    now?: () => Date;
    hostOrigin?: string;
    sandboxOrigin?: string;
  } = {},
): Promise<SessionSnapshot> {
  const config = parseLabConfig(configValue);
  const now = options.now ?? (() => new Date());
  await client.connect();
  const [{ tools }, { resources }] = await Promise.all([
    client.listTools(),
    client.listResources(),
  ]);
  const reads: Record<string, ReadResourceResult> = {};
  const trace = makeDiscoveryTrace(now);

  for (const uri of linkedUris(tools)) {
    trace.push({
      sequence: trace.length + 1,
      timestamp: now().toISOString(),
      layer: "mcp",
      direction: "host-to-server",
      method: "resources/read",
      payload: { uri },
      outcome: "accepted",
    });
    try {
      reads[uri] = await client.readResource({ uri });
      trace.push({
        sequence: trace.length + 1,
        timestamp: now().toISOString(),
        layer: "mcp",
        direction: "server-to-host",
        method: "resources/read:result",
        payload: { uri, contents: reads[uri]?.contents.length ?? 0 },
        outcome: "accepted",
      });
    } catch (error) {
      trace.push({
        sequence: trace.length + 1,
        timestamp: now().toISOString(),
        layer: "mcp",
        direction: "server-to-host",
        method: "resources/read:error",
        payload: {
          uri,
          message: error instanceof Error ? error.message : "Unknown error",
        },
        outcome: "error",
      });
    }
  }

  const sandbox = {
    hostOrigin: options.hostOrigin ?? "http://127.0.0.1:5178",
    sandboxOrigin: options.sandboxOrigin ?? "http://127.0.0.1:5179",
    sandboxTokens: ["allow-scripts", "allow-same-origin", "allow-forms"],
  };
  const contract: AppContractInput = { tools, resources, reads, sandbox };
  const report = analyzeAppContract(contract);
  const resourcesByUri = new Map(
    resources.map((resource) => [resource.uri, resource]),
  );
  const apps: AppDescriptor[] = [];

  for (const tool of tools) {
    const resourceUri = getToolResourceUri(tool);
    if (!resourceUri) continue;
    const read = reads[resourceUri];
    const content =
      read?.contents.find((candidate) => candidate.uri === resourceUri) ??
      read?.contents[0];
    if (!content) continue;
    const html = decodeContent(content);
    if (html === undefined) continue;
    const meta = resolveResourceUiMeta(
      resourcesByUri.get(resourceUri),
      content,
    );
    apps.push({
      toolName: tool.name,
      resourceUri,
      html,
      ...(content.mimeType ? { mimeType: content.mimeType } : {}),
      ...(meta ? { meta } : {}),
    });
  }

  const protocol = client.getProtocolInfo();
  return {
    schemaVersion: RECORDING_SCHEMA_VERSION,
    mode: "live",
    coreProtocolVersion: protocol.version,
    protocolEra: protocol.era,
    appsProtocolVersion: APPS_SPEC_VERSION,
    server: client.getServerInfo(),
    connection: {
      transport: config.connection.transport,
      label: connectionLabel(config.connection),
    },
    tools,
    resources,
    apps,
    findings: report.checks,
    trace,
    sandboxUrl: `${sandbox.sandboxOrigin}/sandbox.html`,
    policy: config.policy,
  };
}
