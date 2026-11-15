# Working on Throughline

This file gives coding agents repository-specific guidance. The [README](README.md) is for users; [CONTRIBUTING.md](CONTRIBUTING.md) describes the human contribution workflow. Follow narrower `AGENTS.md` instructions if they are added to subdirectories.

## Understand the product

Throughline is a standalone, offline-first TypeScript/ESM package. Its **public** model is schema-2 `VisualArtifact`: explicit semantic events compiled into deterministic, inspectable snapshots. A source note, diagram connection, message phase, or animation is *not* a substitute for an authored state write. A missing fact stays missing.

The current branch contains a **v0.2.0 release candidate**, not proof of npm publication. Never confuse npm SemVer with the artifact schema version. The new surface intentionally has no compatibility adapter for schema 1. The old domain-specific source remaining in the repository supports historical regression tests, not the published API.

## Where to work

| Path | Responsibility |
| --- | --- |
| `src/v2/` | Schema, strict JSON validation, compilation, inspection, projection, authoring and digests |
| `src/remark/` | Host-neutral Markdown AST validation and literal MDX transformation |
| `src/node/`, `src/cli/` | Trusted filesystem loading, Markdown/MDX discovery and the `thl` commands |
| `src/react/`, `src/styles/` | Optional React 19 player, accessible controls, SSR/hydration and CSS |
| `src/reference/`, `src/examples.ts` | Four evidence-linked example models and matched explanatory material |
| `src/__tests__/`, `scripts/` | Source, CLI, security, performance, packed-consumer and release verification |
| `playground/` | Development-only reference preview, not a published authoring app |
| `docs/` | Public guides, schema semantics, upgrade and maintainer release procedures |

Read [Architecture](docs/architecture.md), [Grammar](docs/grammar.md) and [Schema 2](docs/schema-v2.md) before changing an observable contract.

## Preserve the public boundaries

There are six package exports: root, `/examples`, `/react`, `/remark`, `/node`, and `/styles/throughline.css`. The separate executable is `thl`. Changes to these entries, peer dependency requirements, the schema, or the grammar are breaking-interface decisions: discuss them and update the docs and tests. Do not introduce deep imports, wildcard exports, legacy `ThroughlinePlayer`, old domain-tagged fences, or an undocumented conversion layer.

- Keep the **root compiler** pure: no filesystem, browser, React, AI provider, telemetry, code evaluation, or network side effects. Deterministic validation, canonical JSON, and bounded replay are mandatory.
- Keep **Markdown** parsing non-executing. Only an unqualified `thl` code node is recognized. Its opening brace selects strict schema-2 JSON. Prose needs a source- and artifact-hash-matched sidecar with an independent human `reviewed` decision; the CLI must never approve its own output.
- Keep **Node host** I/O explicitly confined to a trusted root. Validate relative POSIX locators, reject traversal/symlinks and unsafe Unicode, and avoid revealing private absolute paths or loader exceptions.
- Keep **React** optional. The same compiled truth drives every view. Preserve accessible text equivalents, focus/keyboard behavior, reduced motion, source event IDs and server-rendering consistency.
- Keep **references** honest. Independently verify mathematical examples, distinguish observed facts from simulations and assumptions, and never infer real payment/network outcomes from absent evidence.
- Follow the existing strict TypeScript conventions. Update `package.json` and `pnpm-lock.yaml` together for dependency changes; do not introduce private workspaces, internal links or credentials into public files.

## Local checks

Use Node.js 24+, pnpm 11.2.2, and the committed lockfile.

~~~sh
corepack enable
pnpm install --frozen-lockfile
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

Use `THROUGHLINE_QA_BROWSER=firefox` and `THROUGHLINE_QA_BROWSER=webkit` for other supported browser runs with their installed Playwright binaries. Reproduce the relevant test and inspect the exact PR-head CI, not merely an older green run. Packed-consumer tests matter: a source import is not a proof that npm exports work.

## Pull requests and release safety

Use focused branches. Preserve the maintainer's review workflow; do not merge, sign, tag, deploy, or publish without explicit authorization. Record what changed, the compatibility/security implications, tests **actually** run and blockers. Do not claim automated accessibility checks are human screen-reader acceptance.

The release workflow is deliberately staged: verified source and immutable package bytes, real source- and tarball-bound manual screen-reader acceptance, an approved signed tag, protected OIDC stage-only publishing, human npm 2FA, then independent registry checksum/provenance and consumer verification. Keep these as separate gates. See [Releasing](docs/releasing.md) and the [manual test record](docs/qa/tl-u18-screen-reader-record.md).

Update the [README](README.md), [Changelog](CHANGELOG.md), and relevant public guide whenever behavior changes. Avoid ticket-number narration in user-facing explanations; describe capabilities and limitations instead.
