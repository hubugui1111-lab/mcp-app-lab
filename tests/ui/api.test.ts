// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";

import {
  callTool,
  fetchSession,
  readResource,
  recordBridgeEvent,
} from "../../src/ui/api.js";
import { APP_URI, goodSession } from "../fixtures/contracts.js";

function response(value: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

describe("browser API client", () => {
  it("fetches the current session", async () => {
    const fetchMock = vi.fn(() => Promise.resolve(response(goodSession)));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchSession()).resolves.toEqual(goodSession);
    expect(fetchMock).toHaveBeenCalledWith("/api/session", undefined);
  });

  it("serializes tool and resource requests", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response({ content: [] }))
      .mockResolvedValueOnce(response({ contents: [] }));
    vi.stubGlobal("fetch", fetchMock);

    await callTool({ name: "show-weather", arguments: { city: "Changchun" } });
    await readResource(APP_URI);

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/tools/call",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          name: "show-weather",
          arguments: { city: "Changchun" },
        }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/resources/read",
      expect.objectContaining({ body: JSON.stringify({ uri: APP_URI }) }),
    );
  });

  it("surfaces structured and status-only HTTP failures", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          response({ message: "fixture rejected" }, { status: 400 }),
        )
        .mockResolvedValueOnce(
          response({}, { status: 503, statusText: "Unavailable" }),
        ),
    );

    await expect(fetchSession()).rejects.toThrow("fixture rejected");
    await expect(fetchSession()).rejects.toThrow("503 Unavailable");
  });

  it("sends bridge telemetry as best effort", async () => {
    const fetchMock = vi.fn(() => Promise.reject(new Error("offline")));
    vi.stubGlobal("fetch", fetchMock);

    recordBridgeEvent({
      direction: "app-to-host",
      method: "ui/message",
      payload: {},
    });
    await Promise.resolve();

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/bridge-events",
      expect.objectContaining({ method: "POST", keepalive: true }),
    );
  });
});
