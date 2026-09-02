# MCP App Lab v0.1.1

[Watch the 58-second bilingual narrated demo](https://github.com/hubugui1111-lab/mcp-app-lab/releases/download/v0.1.1/mcp-app-lab-demo.mp4) to see MCP App Lab expose an intentional MIME failure, run a real tool call through the double-iframe sandbox, and preserve the complete protocol trace.

This patch release adds bounded request rates to both local web origins. Repeated host or sandbox file reads now receive HTTP `429` after 600 requests in one minute by default.

The change addresses CodeQL's `js/missing-rate-limiting` finding while preserving the loopback-only listener, distinct-origin iframe boundary, security headers, and existing MCP behavior. A dual-origin integration regression exercises the successful and rejected responses.

## Upgrade

```bash
git fetch --tags
git checkout v0.1.1
npm ci
npm run verify
```

The project remains an independent developer tool rather than an official MCP certification suite. See the [v0.1.0 notes](release-notes-v0.1.0.md) for the complete MVP feature list.
