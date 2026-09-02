import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  Recorder,
  ReplayCursor,
  ReplayMismatchError,
  parseRecording,
  serializeRecording,
} from "../../src/core/recording.js";

describe("recording and deterministic replay", () => {
  it("assigns stable sequence numbers and redacts credentials", () => {
    const recorder = new Recorder({
      id: "rec_test",
      now: () => new Date("2026-09-02T00:00:00.000Z"),
      server: { name: "fixture", version: "0.1.0" },
      connection: { transport: "stdio", label: "fixture" },
      coreProtocolVersion: "2025-11-25",
    });

    recorder.record({
      layer: "mcp",
      direction: "host-to-server",
      method: "tools/call",
      payload: {
        arguments: { city: "Changchun" },
        headers: { authorization: "Bearer live-value" },
        apiKey: "also-live",
      },
    });

    const snapshot = recorder.snapshot();
    expect(snapshot.trace[0]).toMatchObject({
      sequence: 1,
      method: "tools/call",
    });
    expect(JSON.stringify(snapshot)).not.toContain("live-value");
    expect(JSON.stringify(snapshot)).not.toContain("also-live");
    expect(JSON.stringify(snapshot)).toContain("[REDACTED]");
  });

  it("round-trips the versioned fixture recording deterministically", () => {
    const raw = readFileSync(
      new URL("../fixtures/recording.json", import.meta.url),
      "utf8",
    );
    const recording = parseRecording(raw);

    expect(serializeRecording(recording)).toBe(
      `${JSON.stringify(recording, null, 2)}\n`,
    );
  });

  it("returns the recorded response for an exact replay request", () => {
    const raw = readFileSync(
      new URL("../fixtures/recording.json", import.meta.url),
      "utf8",
    );
    const replay = new ReplayCursor(parseRecording(raw));

    expect(
      replay.respond("tools/call", {
        name: "show-weather",
        arguments: { city: "Changchun" },
      }),
    ).toEqual({ content: [{ type: "text", text: "18 C" }] });
  });

  it("fails loudly when replay input diverges", () => {
    const raw = readFileSync(
      new URL("../fixtures/recording.json", import.meta.url),
      "utf8",
    );
    const replay = new ReplayCursor(parseRecording(raw));

    expect(() =>
      replay.respond("tools/call", {
        name: "show-weather",
        arguments: { city: "Beijing" },
      }),
    ).toThrow(ReplayMismatchError);
  });
});
