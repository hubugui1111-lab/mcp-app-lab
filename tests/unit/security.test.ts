import { describe, expect, it } from "vitest";

import {
  assessBridgeMessage,
  buildSandboxCsp,
  clampFrameSize,
  decideOpenLink,
} from "../../src/core/security.js";

describe("sandbox security policies", () => {
  it("builds a deny-by-default CSP", () => {
    const value = buildSandboxCsp();

    expect(value).toContain("default-src 'none'");
    expect(value).toContain("connect-src 'none'");
    expect(value).toContain("frame-src 'none'");
    expect(value).toContain("object-src 'none'");
  });

  it("drops injected CSP sources and reports them", () => {
    const result = buildSandboxCsp({
      connectDomains: [
        "https://api.example.test",
        "https://ok.test; script-src *",
      ],
      resourceDomains: ["https://cdn.example.test\nimg-src *"],
    });

    expect(result.header).toContain("https://api.example.test");
    expect(result.header).not.toContain("script-src *");
    expect(result.rejected).toHaveLength(2);
  });

  it("rejects unknown message sources and origins", () => {
    expect(
      assessBridgeMessage({
        sourceMatches: false,
        origin: "https://attacker.example",
        expectedOrigin: "http://127.0.0.1:4174",
        data: { jsonrpc: "2.0", method: "tools/call" },
      }),
    ).toEqual(
      expect.objectContaining({ accepted: false, reason: "source-mismatch" }),
    );

    expect(
      assessBridgeMessage({
        sourceMatches: true,
        origin: "https://attacker.example",
        expectedOrigin: "http://127.0.0.1:4174",
        data: { jsonrpc: "2.0", method: "tools/call" },
      }),
    ).toEqual(
      expect.objectContaining({ accepted: false, reason: "origin-mismatch" }),
    );
  });

  it("denies external navigation by default and blocks unsafe schemes", () => {
    expect(
      decideOpenLink("https://docs.example.test/guide", { mode: "deny" }),
    ).toEqual(
      expect.objectContaining({ allowed: false, reason: "policy-deny" }),
    );
    expect(
      decideOpenLink("javascript:alert(1)", {
        mode: "allowlist",
        origins: ["*"],
      }),
    ).toEqual(
      expect.objectContaining({ allowed: false, reason: "unsafe-scheme" }),
    );
  });

  it("allows only configured HTTP origins", () => {
    expect(
      decideOpenLink("https://docs.example.test/guide", {
        mode: "allowlist",
        origins: ["https://docs.example.test"],
      }),
    ).toEqual(expect.objectContaining({ allowed: true }));
    expect(
      decideOpenLink("https://other.example.test/guide", {
        mode: "allowlist",
        origins: ["https://docs.example.test"],
      }),
    ).toEqual(
      expect.objectContaining({ allowed: false, reason: "origin-not-allowed" }),
    );
  });

  it("clamps hostile or accidental resize requests", () => {
    expect(
      clampFrameSize(
        { width: -1, height: 100_000 },
        { maxWidth: 1200, maxHeight: 900 },
      ),
    ).toEqual({
      width: 1,
      height: 900,
      clamped: true,
    });
  });
});
