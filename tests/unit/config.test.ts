import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  connectionLabel,
  loadLabConfig,
  parseLabConfig,
} from "../../src/core/config.js";

describe("parseLabConfig", () => {
  it("accepts a stdio command without invoking a shell", () => {
    const config = parseLabConfig({
      connection: {
        transport: "stdio",
        command: "node",
        args: ["server.mjs", "--safe"],
        env: { FIXTURE_MODE: "good" },
      },
    });

    expect(config.connection).toEqual({
      transport: "stdio",
      command: "node",
      args: ["server.mjs", "--safe"],
      env: { FIXTURE_MODE: "good" },
    });
    expect(config.protocolMode).toBe("auto");
    expect(config.policy.openLinks).toBe("deny");
  });

  it("accepts HTTPS and loopback HTTP endpoints", () => {
    expect(
      parseLabConfig({
        connection: { transport: "http", url: "https://mcp.example.test/mcp" },
      }),
    ).toMatchObject({ connection: { transport: "http" } });
    expect(
      parseLabConfig({
        connection: { transport: "http", url: "http://127.0.0.1:3000/mcp" },
      }),
    ).toMatchObject({ connection: { transport: "http" } });
  });

  it("rejects insecure remote HTTP endpoints", () => {
    expect(() =>
      parseLabConfig({
        connection: { transport: "http", url: "http://example.test/mcp" },
      }),
    ).toThrow(/HTTPS or a loopback host/u);
  });

  it("rejects likely secret-bearing inline environment values", () => {
    expect(() =>
      parseLabConfig({
        connection: {
          transport: "stdio",
          command: "node",
          env: { GITHUB_TOKEN: "must-not-enter-recordings" },
        },
      }),
    ).toThrow(/secret-bearing environment key.*GITHUB_TOKEN/iu);
  });

  it("rejects shell syntax in a command field", () => {
    expect(() =>
      parseLabConfig({
        connection: {
          transport: "stdio",
          command: "node && calc.exe",
          args: [],
        },
      }),
    ).toThrow(/executable only/iu);
  });

  it("rejects secret-bearing HTTP headers", () => {
    expect(() =>
      parseLabConfig({
        connection: {
          transport: "http",
          url: "https://mcp.example.test",
          headers: { Authorization: "Bearer private" },
        },
      }),
    ).toThrow(/secret-bearing header.*Authorization/iu);
  });

  it("accepts every loopback spelling and explicit policy limits", () => {
    for (const url of ["http://localhost:3000/mcp", "http://[::1]:3000/mcp"]) {
      expect(
        parseLabConfig({
          connection: { transport: "http", url },
          protocolMode: "legacy",
          policy: {
            openLinks: "allowlist",
            allowedLinkOrigins: ["https://docs.example.test"],
            maxFrameHeight: 800,
            maxFrameWidth: 1_000,
          },
        }),
      ).toMatchObject({
        protocolMode: "legacy",
        policy: { maxFrameHeight: 800 },
      });
    }
  });

  it("loads JSON, resolves a relative stdio cwd, and labels transports", async () => {
    const directory = await mkdtemp(join(tmpdir(), "mcp-app-lab-config-"));
    try {
      await mkdir(join(directory, "fixture"));
      const path = join(directory, "lab.json");
      await writeFile(
        path,
        JSON.stringify({
          connection: {
            transport: "stdio",
            command: "node",
            cwd: "./fixture",
          },
        }),
      );

      const config = await loadLabConfig(path);
      expect(config.connection).toMatchObject({
        args: [],
        cwd: resolve(directory, "fixture"),
      });
      expect(connectionLabel(config.connection)).toBe("node");
      expect(
        connectionLabel({
          transport: "http",
          url: "https://mcp.example.test/mcp",
        }),
      ).toBe("https://mcp.example.test/mcp");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
