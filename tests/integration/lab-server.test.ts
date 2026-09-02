import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import type { LabController } from "../../src/node/controller.js";
import { startLabServer } from "../../src/node/lab-server.js";
import { goodSession } from "../fixtures/contracts.js";

const directories: string[] = [];
const closeServers: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(closeServers.splice(0).map((close) => close()));
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function webRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "mcp-app-lab-web-"));
  directories.push(root);
  await mkdir(join(root, "assets"));
  await writeFile(join(root, "index.html"), "<!doctype html><h1>Host</h1>");
  await writeFile(
    join(root, "sandbox.html"),
    "<!doctype html><h1>Sandbox</h1>",
  );
  await writeFile(join(root, "assets", "fixture.js"), "export {};\n");
  return root;
}

function controller(): LabController {
  return {
    session: goodSession,
    callTool: vi.fn(() => Promise.resolve({ content: [] })),
    readResource: vi.fn(() => Promise.resolve({ contents: [] })),
    recordBridgeEvent: vi.fn(),
  };
}

describe("dual-origin Lab server", () => {
  it("serves the host and sandbox from distinct ephemeral origins", async () => {
    const server = await startLabServer({
      controller: controller(),
      host: "127.0.0.1",
      port: 0,
      sandboxPort: 0,
      webRoot: await webRoot(),
    });
    closeServers.push(server.close);

    expect(new URL(server.hostUrl).origin).not.toBe(
      new URL(server.sandboxUrl).origin,
    );
    const host = await fetch(server.hostUrl);
    expect(await host.text()).toContain("Host");
    expect(host.headers.get("content-security-policy")).toContain(
      "object-src 'none'",
    );

    const csp = encodeURIComponent(
      JSON.stringify({ connectDomains: ["https://api.example.test"] }),
    );
    const sandbox = await fetch(`${server.sandboxUrl}?csp=${csp}`);
    expect(await sandbox.text()).toContain("Sandbox");
    expect(sandbox.headers.get("content-security-policy")).toContain(
      "connect-src https://api.example.test",
    );
    expect(sandbox.headers.get("cache-control")).toContain("no-store");
  });

  it("falls back to deny-all CSP and rejects unknown sandbox paths", async () => {
    const server = await startLabServer({
      controller: controller(),
      port: 0,
      sandboxPort: 0,
      webRoot: await webRoot(),
    });
    closeServers.push(server.close);

    const malformed = await fetch(`${server.sandboxUrl}?csp=%7Bbroken`);
    expect(malformed.headers.get("content-security-policy")).toContain(
      "connect-src 'none'",
    );
    const missing = await fetch(
      `${new URL(server.sandboxUrl).origin}/private.txt`,
    );
    expect(missing.status).toBe(404);
    expect(await missing.text()).toBe("Sandbox assets only");
  });
});
