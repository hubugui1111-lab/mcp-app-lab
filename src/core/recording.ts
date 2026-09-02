import { z } from "zod";

import { APPS_SPEC_VERSION, RECORDING_SCHEMA_VERSION } from "./types.js";
import type {
  ConnectionSummary,
  Recording,
  ServerInfo,
  SessionSnapshot,
  TraceDirection,
  TraceEvent,
  TraceLayer,
} from "./types.js";

const SECRET_KEY =
  /(authorization|credential|password|passwd|private[_-]?key|secret|token|api[_-]?key|cookie)/iu;
const BEARER_VALUE = /\bBearer\s+[A-Za-z0-9._~+/-]+=*/giu;

const traceSchema = z.object({
  sequence: z.number().int().positive(),
  timestamp: z.iso.datetime(),
  layer: z.enum(["mcp", "bridge", "sandbox", "policy"]),
  direction: z.enum([
    "host-to-server",
    "server-to-host",
    "host-to-app",
    "app-to-host",
    "sandbox-to-host",
    "host-to-sandbox",
    "internal",
  ]),
  method: z.string().min(1),
  payload: z.unknown(),
  correlationId: z.string().optional(),
  outcome: z.enum(["accepted", "rejected", "error"]).optional(),
});

const recordingSchema = z.object({
  schemaVersion: z.literal("1.0"),
  recordingId: z.string().min(1),
  createdAt: z.iso.datetime(),
  coreProtocolVersion: z.string().min(1),
  appsProtocolVersion: z.string().min(1),
  server: z.object({ name: z.string(), version: z.string() }),
  connection: z.object({
    transport: z.enum(["stdio", "http"]),
    label: z.string(),
  }),
  trace: z.array(traceSchema),
  session: z.unknown().optional(),
});

export function redactValue(value: unknown, key?: string): unknown {
  if (key && SECRET_KEY.test(key)) return "[REDACTED]";
  if (typeof value === "string")
    return value.replace(BEARER_VALUE, "Bearer [REDACTED]");
  if (Array.isArray(value)) return value.map((entry) => redactValue(entry));
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([entryKey, entryValue]) => [
        entryKey,
        redactValue(entryValue, entryKey),
      ]),
    );
  }
  return value;
}

interface RecorderOptions {
  id: string;
  now?: () => Date;
  server: ServerInfo;
  connection: ConnectionSummary;
  coreProtocolVersion: string;
  session?: SessionSnapshot;
}

interface NewTraceEvent {
  layer: TraceLayer;
  direction: TraceDirection;
  method: string;
  payload: unknown;
  correlationId?: string;
  outcome?: TraceEvent["outcome"];
}

export class Recorder {
  readonly #recording: Recording;
  readonly #now: () => Date;

  constructor(options: RecorderOptions) {
    this.#now = options.now ?? (() => new Date());
    const createdAt = this.#now().toISOString();
    this.#recording = {
      schemaVersion: RECORDING_SCHEMA_VERSION,
      recordingId: options.id,
      createdAt,
      coreProtocolVersion: options.coreProtocolVersion,
      appsProtocolVersion: APPS_SPEC_VERSION,
      server: structuredClone(options.server),
      connection: structuredClone(options.connection),
      trace: [],
      ...(options.session ? { session: structuredClone(options.session) } : {}),
    };
  }

  record(event: NewTraceEvent): TraceEvent {
    const traceEvent: TraceEvent = {
      sequence: this.#recording.trace.length + 1,
      timestamp: this.#now().toISOString(),
      layer: event.layer,
      direction: event.direction,
      method: event.method,
      payload: redactValue(event.payload),
      ...(event.correlationId ? { correlationId: event.correlationId } : {}),
      ...(event.outcome ? { outcome: event.outcome } : {}),
    };
    this.#recording.trace.push(traceEvent);
    return structuredClone(traceEvent);
  }

  setSession(session: SessionSnapshot): void {
    this.#recording.session = structuredClone(session);
  }

  snapshot(): Recording {
    return structuredClone(this.#recording);
  }
}

export function parseRecording(raw: string): Recording {
  const parsed = recordingSchema.parse(JSON.parse(raw) as unknown);
  return parsed as Recording;
}

export function serializeRecording(recording: Recording): string {
  const validated = recordingSchema.parse(recording);
  return `${JSON.stringify(validated, null, 2)}\n`;
}

function canonical(value: unknown): string {
  if (Array.isArray(value))
    return `[${value.map((entry) => canonical(entry)).join(",")}]`;
  if (typeof value === "object" && value !== null) {
    const entries = Object.entries(value).sort(([left], [right]) =>
      left.localeCompare(right),
    );
    return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export class ReplayMismatchError extends Error {
  override readonly name = "ReplayMismatchError";
}

export class ReplayCursor {
  readonly #trace: TraceEvent[];
  #position = 0;

  constructor(recording: Recording) {
    this.#trace = recording.trace;
  }

  respond(method: string, payload: unknown): unknown {
    const requestIndex = this.#trace.findIndex(
      (event, index) =>
        index >= this.#position &&
        event.direction === "app-to-host" &&
        event.method === method,
    );
    if (requestIndex < 0) {
      throw new ReplayMismatchError(`No recorded ${method} request remains`);
    }
    const request = this.#trace[requestIndex];
    if (!request || canonical(request.payload) !== canonical(payload)) {
      throw new ReplayMismatchError(`Replay input diverged for ${method}`);
    }
    const responseIndex = this.#trace.findIndex(
      (event, index) =>
        index > requestIndex &&
        event.direction === "host-to-app" &&
        event.method === `${method}:result`,
    );
    if (responseIndex < 0) {
      throw new ReplayMismatchError(`No recorded response follows ${method}`);
    }
    this.#position = responseIndex + 1;
    return structuredClone(this.#trace[responseIndex]?.payload);
  }
}
