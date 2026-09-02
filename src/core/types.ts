export const CORE_SPEC_VERSION = "2026-07-28";
export const APPS_SPEC_VERSION = "2026-01-26";
export const RECORDING_SCHEMA_VERSION = "1.0";

export type ProtocolMode = "auto" | "legacy" | "modern";

export interface StdioConnection {
  transport: "stdio";
  command: string;
  args: string[];
  cwd?: string;
  env?: Record<string, string>;
}

export interface HttpConnection {
  transport: "http";
  url: string;
  headers?: Record<string, string>;
}

export type LabConnection = StdioConnection | HttpConnection;

export interface LabPolicy {
  openLinks: "deny" | "allowlist";
  allowedLinkOrigins: string[];
  maxFrameHeight: number;
  maxFrameWidth: number;
}

export interface LabConfig {
  connection: LabConnection;
  protocolMode: ProtocolMode;
  policy: LabPolicy;
}

export interface ToolDefinition {
  name: string;
  title?: string;
  description?: string;
  inputSchema: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  _meta?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface ResourceDefinition {
  uri: string;
  name: string;
  title?: string;
  description?: string;
  mimeType?: string;
  _meta?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface ResourceContent {
  uri: string;
  mimeType?: string;
  text?: string;
  blob?: string;
  _meta?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface ReadResourceResult {
  contents: ResourceContent[];
  _meta?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface ToolCallRequest {
  name: string;
  arguments?: Record<string, unknown>;
}

export interface ToolCallResult {
  content: unknown[];
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
  _meta?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface UiCsp {
  connectDomains?: string[];
  resourceDomains?: string[];
  frameDomains?: string[];
  baseUriDomains?: string[];
}

export interface UiPermissions {
  camera?: Record<string, never>;
  microphone?: Record<string, never>;
  geolocation?: Record<string, never>;
  clipboardWrite?: Record<string, never>;
}

export interface ResourceUiMeta {
  csp?: UiCsp;
  permissions?: UiPermissions;
  domain?: string;
  prefersBorder?: boolean;
  [key: string]: unknown;
}

export type FindingSeverity = "pass" | "warning" | "error";

export interface Finding {
  id: string;
  severity: FindingSeverity;
  title: string;
  detail: string;
  remediation?: string;
  evidence?: Record<string, unknown>;
}

export interface FindingSummary {
  passes: number;
  warnings: number;
  errors: number;
}

export interface ConformanceReport {
  specVersions: { core: string; apps: string };
  checks: Finding[];
  summary: FindingSummary;
}

export type TraceLayer = "mcp" | "bridge" | "sandbox" | "policy";
export type TraceDirection =
  | "host-to-server"
  | "server-to-host"
  | "host-to-app"
  | "app-to-host"
  | "sandbox-to-host"
  | "host-to-sandbox"
  | "internal";

export interface TraceEvent {
  sequence: number;
  timestamp: string;
  layer: TraceLayer;
  direction: TraceDirection;
  method: string;
  payload: unknown;
  correlationId?: string;
  outcome?: "accepted" | "rejected" | "error";
}

export interface AppDescriptor {
  toolName: string;
  resourceUri: string;
  html: string;
  mimeType?: string;
  meta?: ResourceUiMeta;
}

export interface ServerInfo {
  name: string;
  version: string;
}

export interface ConnectionSummary {
  transport: LabConnection["transport"];
  label: string;
}

export interface SessionSnapshot {
  schemaVersion: "1.0";
  mode: "live" | "replay";
  coreProtocolVersion: string;
  protocolEra: "legacy" | "modern" | "unknown";
  appsProtocolVersion: string;
  server: ServerInfo;
  connection: ConnectionSummary;
  tools: ToolDefinition[];
  resources: ResourceDefinition[];
  apps: AppDescriptor[];
  findings: Finding[];
  trace: TraceEvent[];
  sandboxUrl?: string;
  policy?: LabPolicy;
}

export interface Recording {
  schemaVersion: "1.0";
  recordingId: string;
  createdAt: string;
  coreProtocolVersion: string;
  appsProtocolVersion: string;
  server: ServerInfo;
  connection: ConnectionSummary;
  trace: TraceEvent[];
  session?: SessionSnapshot;
}

export interface SandboxContract {
  hostOrigin: string;
  sandboxOrigin: string;
  sandboxTokens: string[];
}

export interface AppContractInput {
  tools: readonly ToolDefinition[];
  resources: readonly ResourceDefinition[];
  reads: Readonly<Record<string, ReadResourceResult>>;
  sandbox: SandboxContract;
}
