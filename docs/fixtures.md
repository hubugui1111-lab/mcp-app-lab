# Adversarial fixture gallery

Each fixture is a small configuration for `examples/app-server.mjs`. The server stays valid enough to reach the layer under test; a fixture should fail for one named reason rather than collapse during setup.

## Expected outcomes

| Fixture                       | Injected behavior                                     | Static CLI                  | Runtime evidence                    |
| ----------------------------- | ----------------------------------------------------- | --------------------------- | ----------------------------------- |
| `wrong-mime.json`             | returns `text/html` without the Apps profile          | exit `1`, `APP003`          | Chromium failure screenshot         |
| `bad-uri.json`                | links a tool to HTTPS instead of `ui://`              | exit `1`, `APP001`/`APP002` | unresolved App descriptor           |
| `csp-injection.json`          | inserts a directive delimiter into a CSP source       | exit `1`, `APP006`          | rejected source stays out of CSP    |
| `schema-mismatch.json`        | App calls a string field with a number                | exit `0`                    | tool error in bridge/MCP trace      |
| `tool-error.json`             | server returns `isError: true`                        | exit `0`                    | failed result in MCP trace          |
| `unsafe-postmessage.json`     | App sends a message without JSON-RPC 2.0              | exit `0`                    | bridge rejection trace              |
| `navigation-escape.json`      | App requests a `javascript:` URL                      | exit `0`                    | unsafe-scheme policy rejection      |
| `resize-overflow.json`        | App requests a 100,000 px frame                       | exit `0`                    | clamped resize policy event         |
| `unsupported-capability.json` | App requests `pip` when host offers inline/fullscreen | exit `0`                    | downgrade to inline in policy trace |

Static exit `0` for a runtime fixture is intentional: its resource contract is valid, and the unwanted behavior appears only after the App bridge initializes or a control is used.

## Run the gallery gate

```bash
npm run test:fixtures
```

The script builds the distributable CLI, starts all nine real stdio fixture servers, checks the expected exit code, and asserts the signature conformance ID for every static defect.

## Inspect one fixture interactively

```bash
npm run build:web
npx tsx src/node/cli.ts dev --config fixtures/navigation-escape.json
```

Open <http://127.0.0.1:5178>. Some behaviors occur during initialization; navigation and tool behaviors may require selecting the App control or **Run tool**. Filter mentally by the `policy`, `bridge`, and `mcp` labels in the trace.

The wrong-MIME shortcut is:

```bash
npm run demo:bad
```

## Add a fixture

1. Add a narrowly scoped variant in `examples/app-server.mjs`.
2. Add `fixtures/<name>.json` with a config-relative `cwd`.
3. Add its expected static status to `scripts/verify-fixtures.mjs`.
4. Add a unit test for the underlying invariant or policy decision.
5. Add a Playwright interaction when the browser boundary is material.
6. Document the exact expected trace or finding here.

Never add live credentials, public exploit payloads, or a fixture that contacts a non-loopback service by default.
