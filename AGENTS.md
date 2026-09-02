# Repository guidance for coding agents

## Objective

Keep MCP App Lab a small, evidence-driven App compatibility and sandbox harness. It complements broad MCP inspectors; do not expand it into a generic MCP client without an accepted design issue.

## Required checks

Use Node.js `>=22.19.0` and the exact lockfile.

```bash
npm ci
npm run verify
npx playwright install chromium
npm run test:e2e
```

Run `npm run format` before the final checks. Never update visual snapshots without inspecting the resulting images.

## Non-negotiable security properties

- Keep host and sandbox on distinct loopback origins.
- Validate exact message source, exact origin, and JSON-RPC shape.
- Never introduce wildcard postMessage targets.
- Keep link opening deny-by-default and scheme-restricted.
- Sanitize CSP sources and clamp App-requested dimensions.
- Do not persist credentials or include them in recordings, fixtures, logs, or tests.
- Do not weaken strict TypeScript, validation, coverage thresholds, or failing security fixtures to make a build pass.

Changes to a boundary require a negative regression and an update to `docs/security-model.md`.

## Code organization

- Pure logic stays in `src/core` and must not depend on React or Express.
- MCP connectivity and process/server lifecycle stay in `src/node`.
- Host interaction stays in `src/ui`; the outer relay stays minimal in `src/sandbox`.
- Public Node exports are explicit in `src/node/index.ts`.
- Adversarial examples must be deterministic, local-only, credential-free, and documented in `docs/fixtures.md`.

Preserve unrelated user changes. Use focused commits and explain any protocol-version or dependency compatibility decision with primary-source evidence.
