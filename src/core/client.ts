import type {
  ReadResourceResult,
  ResourceDefinition,
  ServerInfo,
  ToolCallRequest,
  ToolCallResult,
  ToolDefinition,
} from "./types.js";

export interface LabClient {
  connect(): Promise<void>;
  close(): Promise<void>;
  listTools(): Promise<{ tools: ToolDefinition[] }>;
  listResources(): Promise<{ resources: ResourceDefinition[] }>;
  readResource(request: { uri: string }): Promise<ReadResourceResult>;
  callTool(request: ToolCallRequest): Promise<ToolCallResult>;
  getServerInfo(): ServerInfo;
  getProtocolInfo(): { era: "legacy" | "modern" | "unknown"; version: string };
}
