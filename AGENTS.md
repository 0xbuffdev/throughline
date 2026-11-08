# Throughline — repository instructions

These instructions apply to the whole repository. Read them and relevant
docs before modifications. Respect any future nested AGENTS.md by scope.

## Authority and ownership

Throughline is an independently usable, offline, deterministic authored-state
trace compiler with an optional React 19 player, eventually distributed as
@0xbuff/throughline. I am the sole developer, maintainer and reviewer. Make
changes on dedicated branches and open PRs to main. Final review, commit
signing if required and merge remain my actions. Never fabricate these actions
or approvals, or invent additional reviewers.

README.md and docs/ specify the public authoring and package contract;
src/ and package.json implement it. The standalone package must not depend
on application code, curricula, accounts, grading, telemetry, hidden network
calls, unpublished packages or private workspaces. Never include references
or links to private planning or host repositories in public-facing files.

## Code map and contract

- src/index.ts, compiler.ts, dsl.ts, model.ts and tracer.ts:
  parsing, authoring API, schema, bounded deterministic state traces.
- src/domains/: the five accepted domains flow, bindings, binary, matrix,
  callstack; keep registry, fixtures, documentation and tests in sync.
- src/layout/, layout.ts and scene.ts: React-free scene and layout data.
- src/react/: optional accessible React playback, inspector and sound.
- src/styles/throughline.css: explicitly imported, thl-prefixed CSS.
- src/examples.ts: public copyable examples and acceptance fixtures.
- src/**/__tests__/ and scripts/: unit, browser, build and tarball audits.
- tsdown.config.ts and scripts/verify-dist.mjs: compiled distribution.
- RELEASING.md, PUBLIC_RELEASE_AUDIT.md and PUBLIC_SOURCE_HISTORY.md:
  internal release, rights and Git-history review (not package exports).

Support exactly four public package imports:
@0xbuff/throughline, @0xbuff/throughline/react,
@0xbuff/throughline/examples, and
@0xbuff/throughline/styles/throughline.css.
No wildcard or undocumented deep exports. The root compiler must not import
React, DOM globals or network services; React and React DOM stay optional
peer dependencies. Keep Trace.version and Program.version at schema 1,
independent of npm SemVer. Any changes to public types, grammar meaning,
state transitions, limits, diagnostics, CSS or controls need explicit
compatibility review, documentation and regression tests.

## Safety, semantics and accessibility

- Compile synchronously and deterministically. Never eval authored text,
  execute arbitrary code, fetch user URLs, log data to an outside service
  or store source by default.
- Render author-provided strings as text, never untrusted HTML. Preserve
  bounded work/input/depth checks, typed errors and source coordinates,
  cycle rejection, atomic steps, stable identifiers and deterministic seek.
- Retain accessible labels and keyboard controls, live status, sensible
  focus behavior, reduced motion, SSR/hydration, narrow-screen layout
  and strictly opt-in sonification.
- Use existing idiomatic TypeScript/ESM conventions and prefer simplicity.
  Review new dependencies for licenses, security and package impact.
- Cover behavioral changes with relevant unit, browser and independent
  tarball-consumer tests. Do not hide failures using focused/skipped tests.
  Current CI does not automatically forbid focused/skipped tests.

## Development and mandatory checks

Use Node 24 and the pinned pnpm 11.2.2 with the committed lockfile.
This repository is a standalone package, not a pnpm workspace; do not
use pnpm --filter or introduce application-specific workspace scripts.

Run:
1. pnpm install --frozen-lockfile
2. pnpm audit:source
3. pnpm typecheck
4. pnpm test:run
5. pnpm exec playwright install chromium
6. pnpm test:browser:run
7. pnpm build
8. pnpm audit:licenses
9. pnpm audit:pack
10. pnpm audit:browser

These gates cover source boundaries, compiler and browser tests, ESM
exports/types, installed third-party licenses, packed Node/TypeScript/React
SSR consumers, and real Vite/React hydration. Packed consumer checks may
install public dependencies from the network. Report only tests actually run.

The sole routine workflow is .github/workflows/ci.yml, triggered on PRs and
main pushes with read-only permissions. It never stages/publishes or deploys.

## Release boundaries

- Keep production changes separate from administrative release work; avoid
  duplicated workflows, premature scaffolding and private host integration.
- This repository is private; the npm manifest stays 0.0.0 and private: true
  until separately authorized. Apache-2.0 and Copyright 2026 0xBUFF do not
  prove underlying source ownership or redistribution rights.
- The original Git history contains a private planning reference even though
  the current tree is sanitized. Never make this repository public as-is.
  Review PUBLIC_SOURCE_HISTORY.md and require a clean approved public
  snapshot and verified public Git history.
- npm registry registration/staging (which may create a public placeholder),
  source migration, version bumps, signed tags, provenance workflow,
  publishing, history rewriting and repository visibility changes each
  require the appropriate evidence and separate explicit authorization.
- See RELEASING.md. A passing CI check is not publishing approval; do not
  place npm write credentials or OIDC permission in quality CI.
