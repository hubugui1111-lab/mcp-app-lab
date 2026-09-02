import { describe, expect, it } from "vitest";

import { parseLabConfig } from "../../src/core/config.js";

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
});
