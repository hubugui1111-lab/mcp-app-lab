import { describe, expect, it } from "vitest";

import {
  APP_MIME_TYPE,
  analyzeAppContract,
  getToolResourceUri,
  resolveResourceUiMeta,
} from "../../src/core/conformance.js";
import {
  APP_URI,
  GOOD_HTML,
  goodContract,
  goodResourceListing,
  goodResourceRead,
  goodTool,
} from "../fixtures/contracts.js";

describe("MCP Apps conformance", () => {
  it("passes the canonical good contract", () => {
    const report = analyzeAppContract(goodContract);

    expect(report.summary.errors).toBe(0);
    expect(
      report.checks.filter((check) => check.severity === "pass").length,
    ).toBeGreaterThan(5);
    expect(report.specVersions).toEqual({
      core: "2026-07-28",
      apps: "2026-01-26",
    });
  });

  it("supports nested and deprecated flat tool metadata", () => {
    expect(getToolResourceUri(goodTool)).toBe(APP_URI);
    expect(
      getToolResourceUri({
        ...goodTool,
        _meta: { "ui/resourceUri": APP_URI },
      }),
    ).toBe(APP_URI);
  });

  it("reports an invalid ui URI and unresolved resource", () => {
    const report = analyzeAppContract({
      ...goodContract,
      tools: [
        {
          ...goodTool,
          _meta: { ui: { resourceUri: "https://example.test/app.html" } },
        },
      ],
    });

    expect(report.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "APP001", severity: "error" }),
        expect.objectContaining({ id: "APP002", severity: "error" }),
      ]),
    );
  });

  it("reports an exact MIME mismatch", () => {
    const report = analyzeAppContract({
      ...goodContract,
      reads: {
        [APP_URI]: {
          contents: [
            { ...goodResourceRead.contents[0]!, mimeType: "text/html" },
          ],
        },
      },
    });

    expect(report.checks).toContainEqual(
      expect.objectContaining({
        id: "APP003",
        severity: "error",
        detail: expect.stringContaining(APP_MIME_TYPE),
      }),
    );
  });

  it("requires exactly one text or blob HTML body", () => {
    const report = analyzeAppContract({
      ...goodContract,
      reads: {
        [APP_URI]: {
          contents: [
            {
              uri: APP_URI,
              mimeType: APP_MIME_TYPE,
              text: GOOD_HTML,
              blob: Buffer.from(GOOD_HTML).toString("base64"),
            },
          ],
        },
      },
    });

    expect(report.checks).toContainEqual(
      expect.objectContaining({ id: "APP004", severity: "error" }),
    );
  });

  it("prefers read-content UI metadata over listing metadata", () => {
    const resolved = resolveResourceUiMeta(goodResourceListing, {
      ...goodResourceRead.contents[0]!,
      _meta: { ui: { prefersBorder: false } },
    });

    expect(resolved).toEqual({ prefersBorder: false });
  });

  it("detects an undeclared remote script origin", () => {
    const report = analyzeAppContract({
      ...goodContract,
      reads: {
        [APP_URI]: {
          contents: [
            {
              ...goodResourceRead.contents[0]!,
              text: GOOD_HTML.replace(
                "</head>",
                '<script src="https://evil.example/script.js"></script></head>',
              ),
            },
          ],
        },
      },
    });

    expect(report.checks).toContainEqual(
      expect.objectContaining({ id: "APP007", severity: "error" }),
    );
  });

  it("requires different host and sandbox origins", () => {
    const report = analyzeAppContract({
      ...goodContract,
      sandbox: {
        ...goodContract.sandbox,
        sandboxOrigin: goodContract.sandbox.hostOrigin,
      },
    });

    expect(report.checks).toContainEqual(
      expect.objectContaining({ id: "APP008", severity: "error" }),
    );
  });

  it("accepts base64 HTML and diagnoses invalid HTML and visibility", () => {
    const blobReport = analyzeAppContract({
      ...goodContract,
      reads: {
        [APP_URI]: {
          contents: [
            {
              uri: APP_URI,
              mimeType: APP_MIME_TYPE,
              blob: Buffer.from(GOOD_HTML).toString("base64"),
            },
          ],
        },
      },
    });
    expect(blobReport.checks).toContainEqual(
      expect.objectContaining({ id: "APP004", severity: "pass" }),
    );

    const brokenReport = analyzeAppContract({
      ...goodContract,
      tools: [
        {
          ...goodTool,
          _meta: { ui: { resourceUri: APP_URI, visibility: ["secret"] } },
        },
      ],
      reads: {
        [APP_URI]: {
          contents: [
            {
              uri: APP_URI,
              mimeType: APP_MIME_TYPE,
              text: "<main>fragment only</main>",
            },
          ],
        },
      },
    });
    expect(brokenReport.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "APP005", severity: "error" }),
        expect.objectContaining({ id: "APP011", severity: "error" }),
      ]),
    );
  });

  it("flags missing sandbox capabilities and escape tokens", () => {
    const report = analyzeAppContract({
      ...goodContract,
      sandbox: {
        ...goodContract.sandbox,
        sandboxTokens: ["allow-top-navigation"],
      },
    });

    expect(report.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "APP009", severity: "error" }),
        expect.objectContaining({ id: "APP010", severity: "error" }),
      ]),
    );
  });
});
