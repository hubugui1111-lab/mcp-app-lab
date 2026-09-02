# Broken MCP App gallery

Each config starts the same deterministic weather App with one intentional defect. Use them with `mcp-app-lab test --config <file>` for static conformance checks or `mcp-app-lab dev --config <file>` for runtime policy checks.

| Fixture                       | Defect                                           | Expected signal                 |
| ----------------------------- | ------------------------------------------------ | ------------------------------- |
| `wrong-mime.json`             | Drops the MCP Apps MIME profile                  | `APP003` error                  |
| `bad-uri.json`                | Links a tool to an HTTPS URI instead of `ui://`  | `APP001` / `APP002` error       |
| `csp-injection.json`          | Smuggles a directive delimiter into a CSP source | `APP006` error                  |
| `unsupported-capability.json` | Requests `pip` outside the host's offered modes  | policy downgrade in the trace   |
| `schema-mismatch.json`        | Calls a string field with a number               | MCP tool error in the trace     |
| `unsafe-postmessage.json`     | Sends a message without JSON-RPC 2.0             | bridge rejection in the trace   |
| `navigation-escape.json`      | Requests a `javascript:` navigation              | host policy rejection           |
| `resize-overflow.json`        | Requests a 100,000 px frame                      | clamped resize policy event     |
| `tool-error.json`             | Returns `isError: true`                          | failed tool result in the trace |

These are test fixtures, not security exploit examples. They bind only to local transports and contain no credentials.
