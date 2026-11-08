# Contributing to Throughline

Throughline is maintained by one project maintainer. Bug reports,
documentation corrections, test improvements and narrowly scoped code
contributions are welcome. Opening a PR does not guarantee acceptance.

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
pnpm test:run
pnpm exec playwright install chromium
pnpm test:browser:run
pnpm build
pnpm audit:licenses
pnpm audit:pack
pnpm audit:browser
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

The maintainer performs final review, any required signing and merge.
Do not publish npm packages, create release tags or change repository
visibility as part of a contribution without explicit authorization.

## Community and security

Follow [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md). For security-sensitive
findings, follow [SECURITY.md](SECURITY.md) instead of opening a public
issue with exploitation details.

By submitting a contribution, you agree it may be distributed under
the repository's [Apache-2.0 license](LICENSE); do not submit code or
content that you lack rights to contribute.
