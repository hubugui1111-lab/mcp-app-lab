import { describe, expect, it, vi } from "vitest";

import type { LabClient } from "../../src/core/client.js";
import { inspectServer } from "../../src/core/session.js";
import {
  APP_URI,
  goodResourceListing,
  goodResourceRead,
  goodTool,
} from "../fixtures/contracts.js";

function fakeClient(): LabClient {
  return {
    connect: vi.fn(async () => undefined),
    close: vi.fn(async () => undefined),
    listTools: vi.fn(async () => ({ tools: [goodTool] })),
    listResources: vi.fn(async () => ({ resources: [goodResourceListing] })),
    readResource: vi.fn(async ({ uri }) => {
      if (uri !== APP_URI) throw new Error(`Unexpected URI: ${uri}`);
      return goodResourceRead;
    }),
    callTool: vi.fn(async () => ({
      content: [{ type: "text", text: "18 C" }],
    })),
    getServerInfo: vi.fn(() => ({ name: "fixture", version: "0.1.0" })),
    getProtocolInfo: vi.fn(() => ({ era: "legacy", version: "2025-11-25" })),
  };
}

describe("inspectServer", () => {
  it("discovers tools and resolves every linked UI resource", async () => {
    const client = fakeClient();
    const session = await inspectServer(client, {
      connection: {
        transport: "stdio",
        command: "node",
        args: ["fixture.mjs"],
      },
    });

    expect(session.tools).toHaveLength(1);
    expect(session.apps).toEqual([
      expect.objectContaining({
        toolName: "show-weather",
        resourceUri: APP_URI,
      }),
    ]);
    expect(client.readResource).toHaveBeenCalledWith({ uri: APP_URI });
    expect(
      session.findings.filter((finding) => finding.severity === "error"),
    ).toHaveLength(0);
  });

  it("records a resource read failure as a finding instead of crashing discovery", async () => {
    const client = fakeClient();
    vi.mocked(client.readResource).mockRejectedValueOnce(
      new Error("fixture unavailable"),
    );

    const session = await inspectServer(client, {
      connection: {
        transport: "stdio",
        command: "node",
        args: ["fixture.mjs"],
      },
    });

    expect(session.apps).toHaveLength(0);
    expect(session.findings).toContainEqual(
      expect.objectContaining({ id: "APP002", severity: "error" }),
    );
  });
});
