# Contributing

Thanks for helping make MCP App failures easier to reproduce. Small, evidence-backed changes are preferred over broad compatibility claims.

## Development setup

Use Node.js `>=22.19.0` and npm `>=10`.

```bash
npm ci
npx playwright install chromium
npm run verify
npm run test:e2e
```

Run the interactive fixture with `npm run demo`. Build output, coverage, browser reports, recordings, and dependency directories are generated and must not be committed.

## Change workflow

1. Open an issue for a substantial feature or protocol-behavior change.
2. Add a failing test or narrowly scoped fixture that demonstrates the gap.
3. Make the smallest implementation change that satisfies the test.
4. Run the local verification commands above.
5. Update the relevant protocol, security, fixture, and changelog documentation.
6. Submit a focused pull request using the checklist template.

Use Conventional Commit-style subjects where practical, for example `fix: reject wildcard bridge targets` or `docs: clarify replay limits`.

## Tests by boundary

- Pure config, conformance, recording, and policy behavior belongs in `tests/unit`.
- React state and accessible interaction belongs in `tests/ui`.
- SDK transports, CLI processes, local HTTP routes, and server lifecycle belong in `tests/integration`.
- Real iframe messaging, interaction, responsive layout, or rendering belongs in `tests/e2e`.
- A known-bad server behavior belongs in `fixtures` and must state one expected result in `docs/fixtures.md`.

Do not lower coverage thresholds to land a change. Generated code and browser-only entry points may be excluded only when another named gate exercises them.

## Visual changes

Update snapshots only after inspecting the rendered result:

```bash
npm run test:e2e:update
npm run demo:assets
npm run test:e2e
```

The canonical v0.1 baselines are Windows Chromium images. A pull request that changes them must explain why and include both updated assets.

## Security-sensitive changes

Changes to origins, iframe sandbox tokens, CSP construction, link opening, local binding, credential handling, redaction, or imported recordings require:

- a negative test;
- a corresponding update to `docs/security-model.md`;
- no relaxation through `any`, wildcard targets, disabled validation, or hidden policy failures.

Do not report a suspected vulnerability in a public issue. Follow [SECURITY.md](SECURITY.md).

## Licensing

By contributing, you agree that your contribution is licensed under the repository's MIT License. Only submit work you have the right to contribute.
