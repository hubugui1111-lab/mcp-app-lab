# Protocol support

This document describes MCP App Lab `v0.1.0`. “Supported” means implemented and covered by a test or fixture; it does not mean official certification.

## Version lines

| Layer     | Version                                                      | Implementation                         |
| --------- | ------------------------------------------------------------ | -------------------------------------- |
| MCP Core  | `2026-07-28` current line, with automatic legacy negotiation | `@modelcontextprotocol/client@2.0.0`   |
| MCP Apps  | `2026-01-26`                                                 | `@modelcontextprotocol/ext-apps@1.7.5` |
| Recording | `1.0`                                                        | MCP App Lab schema                     |

The UI reports Core and Apps versions separately. They are intentionally not presented as one combined protocol version.

## Transport and MCP operations

| Capability                     | Status        | Notes                                          |
| ------------------------------ | ------------- | ---------------------------------------------- |
| stdio client                   | Supported     | executable plus argument array; no shell       |
| Streamable HTTP client         | Supported     | HTTPS or loopback HTTP                         |
| Legacy standalone SSE client   | Not supported | not part of the v0.1 transport surface         |
| automatic Core negotiation     | Supported     | modern-first probing with legacy compatibility |
| explicit modern pin            | Supported     | `protocolMode: "modern"`                       |
| explicit legacy mode           | Supported     | `protocolMode: "legacy"`                       |
| `tools/list`                   | Supported     | discovery and workbench selection              |
| `resources/list`               | Supported     | discovery and UI resource matching             |
| `resources/read`               | Supported     | startup inspection and App forwarding          |
| `tools/call`                   | Supported     | user and App-originated calls                  |
| OAuth / credential acquisition | Not supported | credentials stay outside the Lab               |

## Apps host surface

| Apps operation                 | Status          | Host behavior                                           |
| ------------------------------ | --------------- | ------------------------------------------------------- |
| `ui/initialize`                | Supported       | Apps version and implemented capabilities returned      |
| `ui/notifications/initialized` | Supported       | completes bridge lifecycle                              |
| tool input/result delivery     | Supported       | selected tool state is sent to the App                  |
| App `tools/call`               | Supported       | forwarded through the local controller API              |
| App `resources/read`           | Supported       | forwarded through the local controller API              |
| size change notification       | Supported       | clamped to configured dimensions                        |
| open-link request              | Restricted      | deny by default; exact HTTPS origin allowlist optional  |
| display-mode request           | Restricted      | inline/fullscreen only; unsupported mode becomes inline |
| logging message                | Observable      | recorded in the bridge trace                            |
| model-context update           | Not implemented | no host handler advertised                              |
| sampling                       | Not implemented | no host capability advertised                           |
| elicitation                    | Not implemented | no host capability advertised                           |

## Static conformance checks

| ID       | Invariant                                                 |
| -------- | --------------------------------------------------------- |
| `APP001` | linked UI resource uses a `ui://` URI                     |
| `APP002` | linked UI resource resolves through `resources/read`      |
| `APP003` | resource MIME is exactly `text/html;profile=mcp-app`      |
| `APP004` | resource has exactly one text or blob representation      |
| `APP005` | resource is a complete HTML5 document                     |
| `APP006` | declared CSP sources are syntactically safe               |
| `APP007` | remote HTML asset origins are declared                    |
| `APP008` | host and sandbox origins differ                           |
| `APP009` | required iframe sandbox capabilities are present          |
| `APP010` | escape-capable sandbox tokens are absent                  |
| `APP011` | tool visibility is absent or a non-empty model/App set    |
| `APP012` | requested resource permissions are understood by the host |
| `APP013` | tool input schema declares an object                      |

Warnings do not change the CLI exit code. One or more errors produce exit `1`. Connection or input failures produce exit `2`.

## References

- [Model Context Protocol specification](https://modelcontextprotocol.io/specification/2026-07-28)
- [MCP Apps repository and specification](https://github.com/modelcontextprotocol/ext-apps)
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
