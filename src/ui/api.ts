import type {
  ReadResourceResult,
  SessionSnapshot,
  ToolCallRequest,
  ToolCallResult,
} from "../core/types.js";
import type { BridgeEventInput } from "../node/controller.js";

async function jsonRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init);
  const value = (await response.json()) as unknown;
  if (!response.ok) {
    const message =
      typeof value === "object" && value && "message" in value
        ? String(value.message)
        : `${response.status} ${response.statusText}`;
    throw new Error(message);
  }
  return value as T;
}

export function fetchSession(): Promise<SessionSnapshot> {
  return jsonRequest<SessionSnapshot>("/api/session");
}

export function callTool(request: ToolCallRequest): Promise<ToolCallResult> {
  return jsonRequest<ToolCallResult>("/api/tools/call", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(request),
  });
}

export function readResource(uri: string): Promise<ReadResourceResult> {
  return jsonRequest<ReadResourceResult>("/api/resources/read", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ uri }),
  });
}

export function recordBridgeEvent(event: BridgeEventInput): void {
  void fetch("/api/bridge-events", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(event),
    keepalive: true,
  }).catch(() => undefined);
}
