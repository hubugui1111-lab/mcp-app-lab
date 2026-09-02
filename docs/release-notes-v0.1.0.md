# MCP App Lab v0.1.0

The first public release turns MCP App behavior into reviewable evidence: a live sandbox, named conformance findings, a four-layer trace, portable recordings, adversarial fixtures, and visual CI.

## Highlights

- Connect to MCP servers over stdio or Streamable HTTP with current Core version negotiation.
- Discover tool-linked `ui://` resources and run 13 App-specific checks.
- Render App HTML behind a distinct-origin double iframe and generated CSP header.
- Exercise tools from the host or App while correlating MCP, bridge, sandbox, and policy events.
- Export redacted schema-`1.0` recordings and replay exact interactions offline.
- Reproduce nine intentionally bad behaviors, including MIME drift, CSP injection, forged bridge shape, navigation escape, and resize overflow.
- Gate releases with strict typing, 80% coverage thresholds, real CLI integrations, fixture contracts, package installation, and Chromium visual regressions.

## Supported versions

- Node.js `>=22.19.0`
- MCP Core current line `2026-07-28`, including automatic legacy negotiation
- MCP Apps `2026-01-26`
- Recording schema `1.0`

See [protocol support](protocol-support.md) for operation-level detail.

## Known limitations

- No OAuth credential flow or credential storage.
- No legacy standalone SSE transport.
- No sampling, elicitation, or model-context-update host capability.
- Replay is exact and deterministic, not a general MCP server simulator.
- Windows Chromium is the canonical v0.1 visual baseline; functional tests remain cross-platform.
- This project is independent and does not issue official MCP conformance certification.

## Upgrade policy

This is the initial release. There is no migration from an earlier public recording format. Future incompatible recording changes will increment `schemaVersion` and fail clearly instead of being guessed.

## Verification recipe

```bash
npm ci
npm run verify
npx playwright install chromium
npm run test:e2e
```

Release archives are built from the tagged commit by GitHub Actions and include a SHA-256 checksum.
