import { describe, expect, it, vi } from "vitest";

import type { LabClient } from "../../src/core/client.js";
import { parseLabConfig } from "../../src/core/config.js";
import type { Recording } from "../../src/core/types.js";
import {
  LiveLabController,
  ReplayLabController,
} from "../../src/node/controller.js";
import {
  APP_URI,
  goodResourceListing,
  goodResourceRead,
  goodSession,
  goodTool,
} from "../fixtures/contracts.js";

function fakeClient(): LabClient {
  return {
    connect: vi.fn(() => Promise.resolve()),
    close: vi.fn(() => Promise.resolve()),
    listTools: vi.fn(() => Promise.resolve({ tools: [goodTool] })),
    listResources: vi.fn(() =>
      Promise.resolve({ resources: [goodResourceListing] }),
    ),
    readResource: vi.fn(() => Promise.resolve(goodResourceRead)),
    callTool: vi.fn(() =>
      Promise.resolve({
        content: [{ type: "text", text: "18 C" }],
        isError: false,
      }),
    ),
    getServerInfo: vi.fn(() => ({ name: "fixture", version: "0.1.0" })),
    getProtocolInfo: vi.fn(() => ({
      era: "legacy" as const,
      version: "2025-11-25",
    })),
  };
}

function replayRecording(): Recording {
  return {
    schemaVersion: "1.0",
    recordingId: "rec_replay",
    createdAt: "2026-09-02T00:00:00.000Z",
    coreProtocolVersion: "2025-11-25",
    appsProtocolVersion: "2026-01-26",
    server: { name: "fixture", version: "0.1.0" },
    connection: { transport: "stdio", label: "fixture" },
    trace: [
      {
        sequence: 1,
        timestamp: "2026-09-02T00:00:00.000Z",
        layer: "bridge",
        direction: "app-to-host",
        method: "tools/call",
        payload: { name: "show-weather", arguments: { city: "Changchun" } },
      },
      {
        sequence: 2,
        timestamp: "2026-09-02T00:00:00.001Z",
        layer: "bridge",
        direction: "host-to-app",
        method: "tools/call:result",
        payload: { content: [{ type: "text", text: "18 C" }] },
      },
      {
        sequence: 3,
        timestamp: "2026-09-02T00:00:00.002Z",
        layer: "bridge",
        direction: "app-to-host",
        method: "resources/read",
        payload: { uri: APP_URI },
      },
      {
        sequence: 4,
        timestamp: "2026-09-02T00:00:00.003Z",
        layer: "bridge",
        direction: "host-to-app",
        method: "resources/read:result",
        payload: goodResourceRead,
      },
    ],
  };
}

describe("Lab controllers", () => {
  it("records successful live calls, reads, bridge events, and shutdown", async () => {
    const client = fakeClient();
    const controller = await LiveLabController.create(
      client,
      parseLabConfig({
        connection: { transport: "stdio", command: "node" },
      }),
      {
        hostOrigin: "http://127.0.0.1:4173",
        sandboxOrigin: "http://127.0.0.1:4174",
      },
    );

    await expect(
      controller.callTool({
        name: "show-weather",
        arguments: { city: "Changchun" },
      }),
    ).resolves.toMatchObject({ isError: false });
    await expect(controller.readResource({ uri: APP_URI })).resolves.toEqual(
      goodResourceRead,
    );
    controller.recordBridgeEvent({
      direction: "app-to-host",
      method: "ui/message",
      payload: { token: "must-not-survive" },
      correlationId: "bridge-1",
      outcome: "rejected",
    });
    controller.recordBridgeEvent({
      direction: "host-to-app",
      method: "ui/ping",
      payload: {},
    });

    const recording = controller.getRecording();
    expect(recording.session?.trace.map((event) => event.method)).toEqual(
      expect.arrayContaining([
        "tools/call",
        "tools/call:result",
        "resources/read",
        "resources/read:result",
        "ui/message",
      ]),
    );
    expect(JSON.stringify(recording)).not.toContain("must-not-survive");
    await controller.close();
    expect(client.close).toHaveBeenCalledOnce();
  });

  it("records thrown and protocol-level tool failures", async () => {
    const client = fakeClient();
    const controller = await LiveLabController.create(
      client,
      parseLabConfig({ connection: { transport: "stdio", command: "node" } }),
      {
        hostOrigin: "http://127.0.0.1:4173",
        sandboxOrigin: "http://127.0.0.1:4174",
      },
    );
    vi.mocked(client.callTool)
      .mockResolvedValueOnce({ content: [], isError: true })
      .mockRejectedValueOnce(new Error("fixture exploded"));

    await expect(
      controller.callTool({ name: "show-weather" }),
    ).resolves.toMatchObject({ isError: true });
    await expect(controller.callTool({ name: "show-weather" })).rejects.toThrow(
      "fixture exploded",
    );
    expect(controller.session.trace.at(-1)).toMatchObject({
      method: "tools/call:error",
      outcome: "error",
    });
  });

  it("replays tool and resource exchanges without mutating source data", async () => {
    const recording = replayRecording();
    const controller = new ReplayLabController(recording);

    await expect(
      controller.callTool({
        name: "show-weather",
        arguments: { city: "Changchun" },
      }),
    ).resolves.toEqual({ content: [{ type: "text", text: "18 C" }] });
    await expect(controller.readResource({ uri: APP_URI })).resolves.toEqual(
      goodResourceRead,
    );
    controller.recordBridgeEvent({
      direction: "app-to-host",
      method: "ignored",
      payload: {},
    });
    expect(controller.getRecording()).toEqual(recording);
    await controller.close();

    const withSession = {
      ...replayRecording(),
      session: structuredClone(goodSession),
    };
    const sessionController = new ReplayLabController(withSession);
    expect(sessionController.session.mode).toBe("replay");
    expect(withSession.session.mode).toBe("live");
  });
});
