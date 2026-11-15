# Contributing to Throughline

Thanks for helping improve Throughline. Contributions can include bug reports, documentation fixes, tests, examples, accessibility findings and changes to the library.

Throughline's current development contract is **schema 2**. Before changing the public API, read the [README](README.md), [architecture](docs/architecture.md), and [authoring grammar](docs/grammar.md). A proposed release candidate in GitHub is not automatically available on npm.

## Discuss and report

Search [existing issues](https://github.com/0xbuffdev/throughline/issues) before filing a new one. For bugs, include the package version, Node/browser/React versions as relevant, a minimal `thl` artifact or code sample, expected behavior, actual behavior and reproducible steps. For feature ideas, describe the user problem and why existing APIs are insufficient.

For suspected vulnerabilities, **do not publish exploit details** in an issue. Follow [SECURITY.md](SECURITY.md).

## Set up the repository

Use Node.js 24+ and the pinned pnpm 11.2.2, with an environment capable of running Playwright browsers:

~~~sh
corepack enable
pnpm install --frozen-lockfile
pnpm dev
~~~

The development preview shows reference examples. It is not the production package or proof of hosted deployment.

### Check a change

Run the checks relevant to your modification. A package-wide change should include:

~~~sh
pnpm audit:source
pnpm typecheck
pnpm preview:typecheck
pnpm preview:build
pnpm test:run
pnpm test:release-tooling
pnpm build
pnpm audit:licenses
pnpm audit:pack
pnpm audit:browser
pnpm audit:frameworks
pnpm audit:markdown-hosts
pnpm exec playwright install chromium
pnpm test:browser:run
~~~

CI also verifies the proposed merge result, independent packaged consumers, signed-release tooling and browser-specific behavior. See [release checks](docs/release-quality.md) and [releasing](docs/releasing.md). Do not report a test as passed unless you ran it or can link to a passing run for the **exact revision**.

## Code and content standards

- Preserve the pure, deterministic core. Do not introduce execution of authored code, implicit network requests, inferred message delivery, or invented state changes.
- Use explicit, stable event IDs. Distinguish known values, unknown values and absent entities. Describe assumptions as assumptions and cite the relevant authored evidence.
- Keep Node filesystem access confined to the `/node` host and CLI. React, browser speech and styles are optional presentation concerns.
- Respect strict JSON, source hash and human editorial-review boundaries for prose materialization. There is no auto-approval command.
- Add regression tests for observable changes and independent truth assertions for teaching examples. Include keyboard, reduced motion, SSR/hydration, screen-reader text and compact-layout checks when touching React.
- Keep public docs and examples in sync. Explain user-visible behavior in plain language; avoid internal ticket identifiers as a substitute for describing changes.
- Add dependencies only with a justified purpose, license review and updated `pnpm-lock.yaml`. Do not submit secrets, sensitive data, or material you lack permission to license.

## Pull requests

Create a focused branch and explain the problem, implementation, compatibility implications, risks and verification in the PR. Update [CHANGELOG.md](CHANGELOG.md) for noteworthy changes and [migration guidance](docs/migration-v0.2.0.md) for breaking ones.

Maintainers review changes and decide on merges. Release signing, tags, npm staging, approval and deployment are separate, explicitly authorized operations and must not happen as a side effect of a contribution.

## Community and support

Follow our [Code of Conduct](CODE_OF_CONDUCT.md). For usage questions, start with the [documentation index](docs/README.md); for reproducible issues or proposals, use [GitHub issues](https://github.com/0xbuffdev/throughline/issues/new/choose). Maintainer support is provided as time permits; there is no promised response time.

By submitting a contribution, you agree that it may be distributed under the repository's [Apache License 2.0](LICENSE), and confirm that you have the right to submit it.
