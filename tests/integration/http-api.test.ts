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
});
