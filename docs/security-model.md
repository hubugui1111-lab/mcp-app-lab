# Security model

MCP App Lab executes untrusted App HTML during local development. Its controls reduce accidental privilege and make boundary violations observable; they do not turn arbitrary HTML into trusted code.

## Assets and trust zones

Protected assets include local files reachable by the MCP server, credentials held outside the config, host-page integrity, user navigation, and exported trace confidentiality.

The trusted computing base is the installed MCP App Lab package, its Node process, host UI, and browser. The connected MCP server, resource metadata, App HTML, tool output, and imported recordings are untrusted inputs.

## Enforced boundaries

- **Loopback listeners:** host and sandbox bind only to `127.0.0.1`.
- **Two origins:** host UI and outer sandbox use different ports and therefore different origins.
- **Nested sandbox:** App HTML runs in an inner iframe within the sandbox proxy; escape-capable sandbox tokens are not enabled.
- **Message authentication:** bridge traffic must match the expected `Window`, exact origin, and JSON-RPC `2.0` marker.
- **CSP construction:** only individual `http`, `https`, or `wss` origins matching the parser are admitted. Whitespace, quotes, backslashes, and directive delimiters are rejected.
- **Navigation policy:** links are denied by default. Allowlist mode requires an HTTPS URL whose origin exactly matches a configured origin.
- **Resize policy:** numeric dimensions are clamped to configured maxima before they reach layout state.
- **Capability policy:** the host advertises only implemented display modes; unsupported requests are downgraded and traced.
- **Config validation:** shell operators in stdio commands, clear secret-bearing environment/header keys, insecure non-loopback HTTP endpoints, and invalid bounds are rejected before connection.
- **Recording redaction:** secret-shaped keys and bearer values are removed recursively before export.

## Threat-to-control map

| Threat                                    | Primary control                           | Evidence                                |
| ----------------------------------------- | ----------------------------------------- | --------------------------------------- |
| Forged sibling-frame message              | exact source and origin checks            | security unit tests; Chromium handshake |
| Non-JSON-RPC postMessage                  | schema guard and rejected trace           | `unsafe-postmessage` fixture            |
| CSP directive injection                   | strict source parser                      | `csp-injection` fixture                 |
| Top-level navigation or unsafe scheme     | deny/allowlist decision                   | `navigation-escape` fixture             |
| Layout denial through huge resize         | numeric validation and clamp              | `resize-overflow` fixture               |
| Unavailable display mode                  | advertised-capability check and downgrade | `unsupported-capability` fixture        |
| Credential leakage in config or recording | config rejection and recursive redaction  | config/recording unit tests             |
| Confusing malformed App resource          | deterministic conformance errors          | `bad-uri` and `wrong-mime` fixtures     |
| Malicious imported recording              | Zod schema validation; immutable replay   | recording unit tests                    |

## Credential handling

MCP App Lab deliberately has no credential store. Do not place secrets in:

- committed JSON configs;
- stdio argument arrays;
- MCP URLs;
- App fixture source;
- recordings shared with an issue.

Secret-like config keys are rejected, but key-name detection cannot recognize every application-specific credential. Launch a server through an external credential provider or a wrapper that inherits credentials without serializing them into the Lab config. Inspect an exported recording before publishing it.

## Residual risks

- A malicious MCP server is a local child process or remote service with the permissions you grant it. The browser sandbox does not sandbox the server process.
- Browser vulnerabilities, dependency supply-chain compromise, DNS rebinding, and operating-system compromise are outside this tool's isolation guarantee.
- CSP metadata describes resources an App requests; permitting an origin allows content from that origin, including content that later changes.
- The loopback API has no multi-user authentication. Do not expose or proxy its ports to another machine.
- Redaction is defense in depth, not a data-loss-prevention guarantee.
- Allowlisted links are opened by the host only after policy acceptance; the destination remains external and untrusted.

## Safe usage checklist

1. Review the MCP server command and dependencies before running it.
2. Use a disposable workspace for an unknown server.
3. Keep the default link-deny policy until navigation is specifically under test.
4. Use explicit CSP origins rather than broad wildcards.
5. Review recordings and screenshots before attaching them to public issues.
6. Run `npm run audit:prod`, CodeQL, and Gitleaks as part of release verification.

Report vulnerabilities privately as described in [SECURITY.md](../SECURITY.md).
