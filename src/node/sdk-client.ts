import {
  Client,
  StreamableHTTPClientTransport,
  type Transport,
  type VersionNegotiationMode,
} from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

import type { LabClient } from "../core/client.js";
import { CORE_SPEC_VERSION } from "../core/types.js";
import type {
  LabConnection,
  ProtocolMode,
  ReadResourceResult,
  ResourceDefinition,
  ServerInfo,
  ToolCallRequest,
  ToolCallResult,
  ToolDefinition,
} from "../core/types.js";

const IMPLEMENTATION = { name: "mcp-app-lab", version: "0.1.1" };

function negotiationMode(mode: ProtocolMode): VersionNegotiationMode {
  return mode === "modern" ? { pin: CORE_SPEC_VERSION } : mode;
}

export class SdkLabClient implements LabClient {
  readonly #client: Client;
  readonly #transport: Transport;
  #connected = false;

  constructor(
    connection: LabConnection,
    options: { protocolMode: ProtocolMode },
  ) {
    this.#client = new Client(IMPLEMENTATION, {
      versionNegotiation: {
        mode: negotiationMode(options.protocolMode),
        probe: { timeoutMs: 2_500, maxRetries: 0 },
      },
      inputRequired: { autoFulfill: false },
    });
    this.#transport =
      connection.transport === "stdio"
        ? new StdioClientTransport({
            command: connection.command,
            args: connection.args,
            ...(connection.cwd ? { cwd: connection.cwd } : {}),
            ...(connection.env ? { env: connection.env } : {}),
            stderr: "pipe",
          })
        : new StreamableHTTPClientTransport(new URL(connection.url), {
            ...(connection.headers
              ? { requestInit: { headers: connection.headers } }
              : {}),
          });
  }

  async connect(): Promise<void> {
    if (this.#connected) return;
    await this.#client.connect(this.#transport);
    this.#connected = true;
  }

  async close(): Promise<void> {
    if (!this.#connected) return;
    await this.#client.close();
    this.#connected = false;
  }

  async listTools(): Promise<{ tools: ToolDefinition[] }> {
    const result = await this.#client.listTools();
    return { tools: structuredClone(result.tools) as ToolDefinition[] };
  }

  async listResources(): Promise<{ resources: ResourceDefinition[] }> {
    const result = await this.#client.listResources();
    return {
      resources: structuredClone(result.resources) as ResourceDefinition[],
    };
  }

  async readResource(request: { uri: string }): Promise<ReadResourceResult> {
    const result = await this.#client.readResource(request);
    return structuredClone(result) as ReadResourceResult;
  }

  async callTool(request: ToolCallRequest): Promise<ToolCallResult> {
    const result = await this.#client.callTool(request);
    return structuredClone(result) as ToolCallResult;
  }

  getServerInfo(): ServerInfo {
    const server = this.#client.getServerVersion();
    return {
      name: server?.name ?? "anonymous-mcp-server",
      version: server?.version ?? "unknown",
    };
  }

  getProtocolInfo(): { era: "legacy" | "modern" | "unknown"; version: string } {
    return {
      era: this.#client.getProtocolEra() ?? "unknown",
      version: this.#client.getNegotiatedProtocolVersion() ?? "unknown",
    };
  }
}

export function createSdkLabClient(
  connection: LabConnection,
  options: { protocolMode: ProtocolMode },
): LabClient {
  return new SdkLabClient(connection, options);
}
