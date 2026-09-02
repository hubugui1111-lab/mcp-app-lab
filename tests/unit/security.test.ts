import { describe, expect, it } from "vitest";

import {
  assessBridgeMessage,
  buildPermissionsAllow,
  buildSandboxCsp,
  clampFrameSize,
  decideOpenLink,
  requireLoopbackHttpOrigin,
} from "../../src/core/security.js";

describe("sandbox security policies", () => {
  it("normalizes local host origins and rejects remote embedding origins", () => {
    expect(requireLoopbackHttpOrigin("http://127.0.0.1:4173/path")).toBe(
      "http://127.0.0.1:4173",
    );
    expect(() => requireLoopbackHttpOrigin("https://example.test")).toThrow(
      /non-loopback host origin/u,
    );
    expect(() => requireLoopbackHttpOrigin("not a URL")).toThrow(/valid URL/u);
  });

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

  it("emits declared resource, connection, frame, and base origins", () => {
    const result = buildSandboxCsp({
      connectDomains: ["wss://events.example.test"],
      resourceDomains: ["https://cdn.example.test"],
      frameDomains: ["https://frames.example.test"],
      baseUriDomains: ["https://base.example.test"],
    });

    expect(result.header).toContain(
      "script-src 'self' 'unsafe-inline' https://cdn.example.test",
    );
    expect(result.header).toContain("connect-src wss://events.example.test");
    expect(result.header).toContain("frame-src https://frames.example.test");
    expect(result.header).toContain("base-uri https://base.example.test");
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

  it("rejects malformed JSON-RPC and accepts an exact bridge peer", () => {
    expect(
      assessBridgeMessage({
        sourceMatches: true,
        origin: "http://127.0.0.1:4174",
        expectedOrigin: "http://127.0.0.1:4174",
        data: null,
      }),
    ).toEqual({ accepted: false, reason: "invalid-jsonrpc" });
    expect(
      assessBridgeMessage({
        sourceMatches: true,
        origin: "http://127.0.0.1:4174",
        expectedOrigin: "http://127.0.0.1:4174",
        data: { jsonrpc: "2.0", method: "ping" },
      }),
    ).toEqual({ accepted: true, reason: "accepted" });
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
    expect(decideOpenLink("not a URL", { mode: "deny" })).toEqual({
      allowed: false,
      reason: "invalid-url",
    });
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
    expect(
      clampFrameSize({ width: 400.4 }, { maxWidth: 1_200, maxHeight: 900 }),
    ).toEqual({ width: 400, clamped: true });
    expect(clampFrameSize({}, { maxWidth: 1_200, maxHeight: 900 })).toEqual({
      clamped: false,
    });
  });

  it("maps only requested browser permissions", () => {
    expect(buildPermissionsAllow(undefined)).toBe("");
    expect(
      buildPermissionsAllow({
        camera: {},
        microphone: {},
        geolocation: {},
        clipboardWrite: {},
      }),
    ).toBe(
      "camera 'self'; microphone 'self'; geolocation 'self'; clipboard-write 'self'",
    );
  });
});
