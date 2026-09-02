import { describe, expect, it, vi } from "vitest";
import request from "supertest";

import { createLabHttpApp } from "../../src/node/http-app.js";
import { goodSession } from "../fixtures/contracts.js";

describe("local Lab HTTP API", () => {
  it("serves health and a sanitized session snapshot", async () => {
    const app = createLabHttpApp({
      session: goodSession,
      callTool: vi.fn(async () => ({
        content: [{ type: "text", text: "18 C" }],
      })),
      readResource: vi.fn(async () => ({ contents: [] })),
      recordBridgeEvent: vi.fn(),
    });

    await request(app)
      .get("/api/health")
      .expect(200, { status: "ok", version: "0.1.0" });
    const response = await request(app).get("/api/session").expect(200);
    expect(response.body.server).toEqual(goodSession.server);
    expect(JSON.stringify(response.body)).not.toMatch(
      /authorization|api[_-]?key/iu,
    );
  });

  it("validates tool-call bodies and returns deterministic JSON errors", async () => {
    const app = createLabHttpApp({
      session: goodSession,
      callTool: vi.fn(async () => ({ content: [] })),
      readResource: vi.fn(async () => ({ contents: [] })),
      recordBridgeEvent: vi.fn(),
    });

    await request(app)
      .post("/api/tools/call")
      .send({ name: 7, arguments: [] })
      .expect(400)
      .expect((response) => {
        expect(response.body).toEqual(
          expect.objectContaining({
            error: "invalid_request",
            issues: expect.any(Array),
          }),
        );
      });
  });

  it("forwards a valid tool call exactly once", async () => {
    const callTool = vi.fn(async () => ({
      content: [{ type: "text", text: "18 C" }],
    }));
    const app = createLabHttpApp({
      session: goodSession,
      callTool,
      readResource: vi.fn(async () => ({ contents: [] })),
      recordBridgeEvent: vi.fn(),
    });

    await request(app)
      .post("/api/tools/call")
      .send({ name: "show-weather", arguments: { city: "Changchun" } })
      .expect(200);
    expect(callTool).toHaveBeenCalledOnce();
    expect(callTool).toHaveBeenCalledWith({
      name: "show-weather",
      arguments: { city: "Changchun" },
    });
  });

  it("validates and forwards resource reads and bridge events", async () => {
    const readResource = vi.fn(() =>
      Promise.resolve({ contents: [{ uri: "ui://fixture", text: "ok" }] }),
    );
    const recordBridgeEvent = vi.fn();
    const app = createLabHttpApp({
      session: goodSession,
      callTool: vi.fn(() => Promise.resolve({ content: [] })),
      readResource,
      recordBridgeEvent,
    });

    await request(app).post("/api/resources/read").send({ uri: 7 }).expect(400);
    await request(app)
      .post("/api/resources/read")
      .send({ uri: "ui://fixture" })
      .expect(200);
    expect(readResource).toHaveBeenCalledWith({ uri: "ui://fixture" });

    await request(app)
      .post("/api/bridge-events")
      .send({ direction: "outside", method: "bad", payload: {} })
      .expect(400);
    await request(app)
      .post("/api/bridge-events")
      .send({
        direction: "app-to-host",
        method: "ui/message",
        payload: { text: "hello" },
        correlationId: "bridge-1",
        outcome: "accepted",
      })
      .expect(202, { accepted: true });
    expect(recordBridgeEvent).toHaveBeenCalledWith(
      expect.objectContaining({ method: "ui/message" }),
    );
  });

  it("exports recordings when available and reports when unavailable", async () => {
    const base = {
      session: goodSession,
      callTool: vi.fn(() => Promise.resolve({ content: [] })),
      readResource: vi.fn(() => Promise.resolve({ contents: [] })),
      recordBridgeEvent: vi.fn(),
    };
    const unavailable = createLabHttpApp(base);
    await request(unavailable)
      .get("/api/recording")
      .expect(404, { error: "recording_unavailable" });

    const available = createLabHttpApp({
      ...base,
      getRecording: () => ({
        schemaVersion: "1.0",
        recordingId: "rec_http",
        createdAt: "2026-09-02T00:00:00.000Z",
        coreProtocolVersion: "2025-11-25",
        appsProtocolVersion: "2026-01-26",
        server: goodSession.server,
        connection: goodSession.connection,
        trace: [],
      }),
    });
    const exported = await request(available).get("/api/recording").expect(200);
    expect(exported.headers["content-disposition"]).toContain(
      "mcp-app-lab-recording.json",
    );
    expect(exported.body.recordingId).toBe("rec_http");
  });

  it("turns controller failures into stable server errors", async () => {
    const app = createLabHttpApp({
      session: goodSession,
      callTool: vi.fn(() => Promise.reject(new Error("fixture exploded"))),
      readResource: vi.fn(() =>
        Promise.reject(new Error("resource unavailable")),
      ),
      recordBridgeEvent: vi.fn(),
    });

    await request(app)
      .post("/api/tools/call")
      .send({ name: "show-weather" })
      .expect(500, {
        error: "lab_operation_failed",
        message: "fixture exploded",
      });
    await request(app)
      .post("/api/resources/read")
      .send({ uri: "ui://fixture" })
      .expect(500, {
        error: "lab_operation_failed",
        message: "resource unavailable",
      });
  });
});
