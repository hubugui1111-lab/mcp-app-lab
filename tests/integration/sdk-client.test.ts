import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import { createSdkLabClient } from "../../src/node/sdk-client.js";

const repositoryRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const fixtureServer = resolve(repositoryRoot, "examples/app-server.mjs");
const children: ChildProcess[] = [];

afterEach(async () => {
  await Promise.all(
    children.splice(0).map(async (child) => {
      if (child.exitCode === null) child.kill("SIGTERM");
      if (child.exitCode === null) await once(child, "exit");
    }),
  );
});

async function startHttpFixture(): Promise<string> {
  const child = spawn(
    process.execPath,
    [fixtureServer, "--transport", "http", "--port", "0"],
    {
      cwd: repositoryRoot,
      stdio: ["ignore", "ignore", "pipe"],
      windowsHide: true,
    },
  );
  children.push(child);

  return await new Promise<string>((resolveUrl, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("HTTP fixture startup timed out")),
      10_000,
    );
    child.once("error", reject);
    child.stderr?.on("data", (chunk: Buffer) => {
      const match = /MCP_FIXTURE_READY (http:\/\/[^\s]+)/u.exec(
        chunk.toString("utf8"),
      );
      if (match?.[1]) {
        clearTimeout(timeout);
        resolveUrl(match[1]);
      }
    });
  });
}

describe("SDK-backed MCP connections", () => {
  it("discovers and reads an App over stdio", async () => {
    const client = createSdkLabClient(
      {
        transport: "stdio",
        command: process.execPath,
        args: [fixtureServer, "--variant", "good"],
      },
      { protocolMode: "auto" },
    );

    await client.connect();
    await client.connect();
    try {
      const tools = await client.listTools();
      const resources = await client.listResources();
      const read = await client.readResource({
        uri: "ui://weather/dashboard.html",
      });

      expect(tools.tools.map((tool) => tool.name)).toContain("show-weather");
      expect(resources.resources.map((resource) => resource.uri)).toContain(
        "ui://weather/dashboard.html",
      );
      expect(read.contents[0]).toMatchObject({
        mimeType: "text/html;profile=mcp-app",
      });
      expect(client.getProtocolInfo().era).toMatch(/legacy|modern/u);
    } finally {
      await client.close();
      await client.close();
    }
  }, 20_000);

  it("discovers and calls an App over Streamable HTTP", async () => {
    const url = await startHttpFixture();
    const client = createSdkLabClient(
      { transport: "http", url },
      { protocolMode: "auto" },
    );

    await client.connect();
    try {
      const result = await client.callTool({
        name: "show-weather",
        arguments: { city: "Changchun" },
      });
      expect(result).toMatchObject({
        structuredContent: { city: "Changchun", temperatureC: 18 },
      });
    } finally {
      await client.close();
    }
  }, 20_000);

  it("reports stable fallback metadata before connecting", async () => {
    const client = createSdkLabClient(
      {
        transport: "stdio",
        command: process.execPath,
        args: [fixtureServer],
      },
      { protocolMode: "modern" },
    );

    expect(client.getServerInfo()).toEqual({
      name: "anonymous-mcp-server",
      version: "unknown",
    });
    expect(client.getProtocolInfo()).toEqual({
      era: "unknown",
      version: "unknown",
    });
    await client.close();
  });
});
