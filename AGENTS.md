# AGENTS.md

Instructions for coding agents working in this repository. This file applies
to the entire repository; follow any more specific `AGENTS.md` in a
subdirectory when present.

## Project overview

Throughline (`@0xbuff/throughline`) is a standalone TypeScript/ESM package
for compiling Markdown-authored state traces into bounded, deterministic
snapshots. Its React 19 player is optional. The package must remain usable
without a host application, account, backend, network connection, or React
when importing the core compiler.

Read `README.md`, `docs/architecture.md`, and the relevant grammar/domain
documentation before changing observable behavior. The source and
`package.json` define the implementation and published package contract.

## Development and verification

Use Node.js 24+, pnpm 11.2.2 and the committed lockfile in this
single-package repository. Run the relevant tests for each change and
follow [verification and release procedures](docs/releasing.md) for a
full release candidate. Never misrepresent skipped or failed checks.

## Repository map

- `src/index.ts`, `src/compiler.ts`, `src/dsl.ts`, `src/model.ts`,
  `src/tracer.ts`: the core parser, validation, types, and trace compiler.
- `src/domains/`: the five supported domains: `flow`, `bindings`,
  `binary`, `matrix`, and `callstack`.
- `src/remark/`: optional mdast validation plugin; keep React out and preserve
  host-owned source positions.
- `src/layout/`, `src/layout.ts`, `src/scene.ts`: React-independent
  scene composition and layout.
- `src/react/`: optional player, controls, inspector, accessible
  captions, and opt-in sonification.
- `src/styles/throughline.css`: explicitly imported, `thl-`-namespaced
  player styles and `--thl-*` customization tokens.
- `src/examples.ts`: public examples and acceptance fixtures.
- `src/**/__tests__/`, `scripts/`: regression, browser, packaging,
  source-boundary, and license checks.
- `docs/`: grammar, authoring, integration and architecture documentation.
- `.github/workflows/ci.yml`: read-only quality checks.
- `.github/workflows/publish.yml`, `docs/releasing.md`: manual npm
  staging, provenance, and maintainer approval procedures.

## Public API and compatibility

Support exactly these package imports:

- `@0xbuff/throughline`
- `@0xbuff/throughline/remark`
- `@0xbuff/throughline/react`
- `@0xbuff/throughline/examples`
- `@0xbuff/throughline/styles/throughline.css`

Do not add undocumented deep imports or wildcard exports. The core
compiler must never depend on React, browser globals, or host-specific
code. Keep `react` and `react-dom` as optional peer dependencies.

`Program.version` and `Trace.version` are schema version `1`, not the
npm package version. Review compatibility and update documentation and
regression tests when changing public types, grammar, trace semantics,
diagnostics, limits, CSS selectors, theming, or playback behavior.
Preserve deterministic compilation and stable seeking through frames.

## Implementation and security rules

- Follow the existing strict TypeScript, ESM, and code formatting
  conventions; keep changes small and avoid unnecessary dependencies.
- Never execute authored source, call `eval`, or fetch remote resources
  as part of compilation. No telemetry or persistent source storage.
- Render author-provided strings as text, not untrusted HTML.
- Preserve bounds on source size, work, state and expansion, plus
  source-positioned errors, cycle rejection, and atomic state updates.
- Preserve accessible labels, keyboard navigation, live status, focus
  visibility, reduced-motion behavior, responsive layout, and SSR
  hydration. Keep sound opt-in.
- Review dependency licenses, notices, bundled output, and package
  contents before changing dependencies or build configuration.
- Never add credentials, private planning links, host-only packages,
  unpublished dependencies, or sensitive materials to public source.

## Change and release workflow

- Work on a dedicated branch and open a focused PR against `main`.
  Document purpose, compatibility impact, implementation, and checks
  actually run. Keep `README.md`, relevant `docs/`, tests, and
  `CHANGELOG.md` in sync with user-visible changes.
- Final review, any required signing, merges, Git tags and npm release
  approvals require maintainer authorization. Never invent approvals or
  claim unperformed actions are complete.
- Do not publish, stage, approve, move release tags, change repository
  visibility, or rewrite Git history without explicit authorization.
- Publication uses an immutable, GitHub-verified signed tag and the
  manually dispatched `publish.yml` workflow. Only its protected
  `npm-publish` staging job receives `id-token: write`. No npm
  token or OIDC write permission belongs in quality CI. npm staging
  is not a public release; final npm 2FA approval is separate.

See `CONTRIBUTING.md`, `SECURITY.md` and `docs/releasing.md` for
contribution, security reporting and release procedures.
