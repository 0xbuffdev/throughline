# Contributing to Throughline

## Before you start

- Check the [README](README.md), [authoring docs](docs/grammar.md),
  [domain catalog](docs/catalog.md) and existing issues.
- For an API, grammar, trace-schema, accessibility or dependency change,
  discuss its compatibility impact in an issue before implementing.
- Keep Throughline independent of private applications, curricula,
  accounts, external services, unpublished dependencies and telemetry.
- Do not include credentials, private documents, proprietary code or
  sensitive vulnerability details in a public issue or PR.

## Development

Prerequisites: Node.js 24+, pnpm 11.2.2 and a Chromium-capable system.

~~~sh
pnpm install --frozen-lockfile
pnpm audit:source
pnpm typecheck
pnpm preview:typecheck
pnpm preview:build
pnpm test:run
pnpm exec playwright install chromium
pnpm test:browser:run
pnpm build
pnpm audit:licenses
pnpm audit:pack
pnpm audit:browser
pnpm audit:frameworks
pnpm audit:markdown-hosts
~~~

This repository is a standalone package. The root compiler must stay
React-free and deterministic; optional React peer dependencies belong
only in the player. See [architecture](docs/architecture.md) for the
compiler-to-player boundary.

## Pull requests

1. Open a focused branch and keep unrelated changes separate.
2. Add regression tests for behavior changes; cover browser behavior,
   keyboard access, reduced motion or hydration when relevant.
3. Update docs and examples when authoring syntax, exports or observable
   behavior changes. Do not silently change schema version 1.
4. Run applicable tests and record exactly what passed. Avoid skipped
   or focused tests.
5. Open the PR with a concise purpose, implementation notes, potential
   compatibility risks, test results and any remaining work.

Maintainers perform final review, any required signing and merge.
Do not publish npm packages, create release tags or change repository
visibility as part of a contribution without explicit authorization.

## Community and security

Follow [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md). For security-sensitive
findings, follow [SECURITY.md](SECURITY.md) instead of opening a public
issue with exploitation details.

By submitting a contribution, you agree it may be distributed under
the repository's [Apache-2.0 license](LICENSE); do not submit code or
content that you lack rights to contribute.

## Support

For usage questions, consult the [README](README.md),
[grammar reference](docs/grammar.md),
[domain catalog](docs/catalog.md), and
[architecture notes](docs/architecture.md).

For a reproducible bug, use the
[bug report template](https://github.com/0xbuffdev/throughline/issues/new/choose)
and include the version,
minimal authored `thl` block, expected/actual behavior and relevant
runtime (Node, browser, React). Avoid disclosing secrets or sensitive
content.

For an API or feature idea, use the feature request template and
explain the underlying problem and compatibility impact. Support and review are provided as available, without a guaranteed response time.

**Security vulnerabilities:** use [SECURITY.md](SECURITY.md) rather than
publishing exploitation details in an issue.
