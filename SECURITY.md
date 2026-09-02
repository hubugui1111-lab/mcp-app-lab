# Security policy

## Supported versions

| Version  | Security updates |
| -------- | ---------------- |
| `0.1.x`  | Supported        |
| `<0.1.0` | Not supported    |

Only the latest patch release on a supported line receives fixes.

## Report a vulnerability

Use GitHub's **Report a vulnerability** form in the repository Security tab. Do not open a public issue, discussion, or pull request for an undisclosed vulnerability.

Include:

- affected version and commit;
- operating system, Node.js version, browser, and transport;
- the smallest safe reproduction;
- the security boundary crossed and likely impact;
- whether any real credentials or third-party data were involved.

Use synthetic fixtures whenever possible. Do not send live tokens, private recordings, or weaponized public payloads.

You should receive an acknowledgement within 5 business days and an initial assessment within 10 business days. Timelines for a fix and disclosure depend on severity and coordinated-release needs. Good-faith research that avoids privacy violations, service disruption, and data access beyond what is necessary is welcome.

## Scope reminders

High-value reports include origin/source validation bypass, iframe escape enabled by this project, CSP construction injection, unauthorized local API access outside the documented loopback model, recording redaction bypass with a realistic secret, and dependency or release-artifact compromise.

Known limitations in [docs/security-model.md](docs/security-model.md), a malicious MCP server exercising permissions the user explicitly granted it, and missing features without a boundary bypass are generally not vulnerabilities.
