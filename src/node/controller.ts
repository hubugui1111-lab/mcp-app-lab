import { randomUUID } from "node:crypto";

import type { LabClient } from "../core/client.js";
import { Recorder, ReplayCursor } from "../core/recording.js";
import { inspectServer } from "../core/session.js";
import { APPS_SPEC_VERSION, RECORDING_SCHEMA_VERSION } from "../core/types.js";
import type {
  LabConfig,
  ReadResourceResult,
  Recording,
  SessionSnapshot,
  ToolCallRequest,
  ToolCallResult,
  TraceEvent,
} from "../core/types.js";

export interface BridgeEventInput {
  direction:
    "host-to-app" | "app-to-host" | "sandbox-to-host" | "host-to-sandbox";
  method: string;
  payload: unknown;
  correlationId?: string | undefined;
  outcome?: TraceEvent["outcome"] | undefined;
}

export interface LabController {
  readonly session: SessionSnapshot;
  callTool(request: ToolCallRequest): Promise<ToolCallResult>;
  readResource(request: { uri: string }): Promise<ReadResourceResult>;
  recordBridgeEvent(event: BridgeEventInput): void;
  getRecording?(): Recording;
  close?(): Promise<void>;
}

export class LiveLabController implements LabController {
  readonly session: SessionSnapshot;
  readonly #client: LabClient;
  readonly #recorder: Recorder;

  private constructor(client: LabClient, session: SessionSnapshot) {
    this.#client = client;
    this.session = session;
    this.#recorder = new Recorder({
      id: `rec_${randomUUID()}`,
      server: session.server,
      connection: session.connection,
      coreProtocolVersion: session.coreProtocolVersion,
      session,
    });
  }

  static async create(
    client: LabClient,
    config: LabConfig,
    origins: { hostOrigin: string; sandboxOrigin: string },
  ): Promise<LiveLabController> {
    const session = await inspectServer(client, config, origins);
    return new LiveLabController(client, session);
  }

  #record(event: Omit<TraceEvent, "sequence" | "timestamp">): void {
    const recorded = this.#recorder.record(event);
    this.session.trace.push({
      ...recorded,
      sequence: this.session.trace.length + 1,
    });
  }

  async callTool(request: ToolCallRequest): Promise<ToolCallResult> {
    const correlationId = randomUUID();
    this.#record({
      layer: "mcp",
      direction: "host-to-server",
      method: "tools/call",
      payload: request,
      correlationId,
      outcome: "accepted",
    });
    try {
      const result = await this.#client.callTool(request);
      this.#record({
        layer: "mcp",
        direction: "server-to-host",
        method: "tools/call:result",
        payload: result,
        correlationId,
        outcome: result.isError ? "error" : "accepted",
      });
      return result;
    } catch (error) {
      this.#record({
        layer: "mcp",
        direction: "server-to-host",
        method: "tools/call:error",
        payload: {
          message:
            error instanceof Error ? error.message : "Unknown tool error",
        },
        correlationId,
        outcome: "error",
      });
      throw error;
    }
  }

  async readResource(request: { uri: string }): Promise<ReadResourceResult> {
    const correlationId = randomUUID();
    this.#record({
      layer: "mcp",
      direction: "host-to-server",
      method: "resources/read",
      payload: request,
      correlationId,
      outcome: "accepted",
    });
    const result = await this.#client.readResource(request);
    this.#record({
      layer: "mcp",
      direction: "server-to-host",
      method: "resources/read:result",
      payload: result,
      correlationId,
      outcome: "accepted",
    });
    return result;
  }

  recordBridgeEvent(event: BridgeEventInput): void {
    this.#record({
      layer: "bridge",
      direction: event.direction,
      method: event.method,
      payload: event.payload,
      ...(event.correlationId === undefined
        ? {}
        : { correlationId: event.correlationId }),
      ...(event.outcome === undefined ? {} : { outcome: event.outcome }),
    });
  }

  getRecording(): Recording {
    this.#recorder.setSession(this.session);
    return this.#recorder.snapshot();
  }

  async close(): Promise<void> {
    await this.#client.close();
  }
}

export class ReplayLabController implements LabController {
  readonly session: SessionSnapshot;
  readonly #cursor: ReplayCursor;

  constructor(private readonly recording: Recording) {
    this.#cursor = new ReplayCursor(recording);
    this.session = recording.session
      ? structuredClone(recording.session)
      : {
          schemaVersion: RECORDING_SCHEMA_VERSION,
          mode: "replay",
          coreProtocolVersion: recording.coreProtocolVersion,
          protocolEra: "unknown",
          appsProtocolVersion:
            recording.appsProtocolVersion || APPS_SPEC_VERSION,
          server: recording.server,
          connection: recording.connection,
          tools: [],
          resources: [],
          apps: [],
          findings: [],
          trace: recording.trace,
        };
    this.session.mode = "replay";
  }

  callTool(request: ToolCallRequest): Promise<ToolCallResult> {
    return Promise.resolve(
      this.#cursor.respond("tools/call", request) as ToolCallResult,
    );
  }

  readResource(request: { uri: string }): Promise<ReadResourceResult> {
    return Promise.resolve(
      this.#cursor.respond("resources/read", request) as ReadResourceResult,
    );
  }

  recordBridgeEvent(_event: BridgeEventInput): void {
    // Replay is immutable: live browser traffic must not alter the recording.
  }

  getRecording(): Recording {
    return structuredClone(this.recording);
  }

  close(): Promise<void> {
    return Promise.resolve();
  }
}
