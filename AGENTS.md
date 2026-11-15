# Repository instructions

These instructions apply to the entire Throughline repository. Follow more specific `AGENTS.md` files where present. Read the [public architecture](docs/architecture.md) and the relevant contract before changing observable behavior.

## Purpose and boundaries

Throughline is a standalone TypeScript/ESM package for authoring and inspecting deterministic, evidence-linked **schema-2 `VisualArtifact`** timelines. The compiler is pure and offline. React 19 is optional. The CLI is Node 24+ only. Neither the compiler nor the CLI executes authoring prose or calls an AI provider.

The current source is a pre-release schema-2 redesign. Do not describe it as already published to npm. The package version and the artifact schema version are different concepts. No version-1 backward compatibility or translation layer may be added.

## Public contracts

Keep exactly these package exports unless a reviewed ticket explicitly changes them:

- `@0xbuff/throughline`: `validateArtifact`, `parseArtifactJson`, `serializeArtifact`, `compileArtifact`, `inspectTrace`, `projectView`, `projectInspection`, authoring/hash helpers and associated schema-2 types.
- `@0xbuff/throughline/remark`: mdast validation and literal-data MDX transform.
- `@0xbuff/throughline/node`: trusted Node filesystem host and non-executing Markdown/MDX AST discovery for the CLI.
- `@0xbuff/throughline/react`: `ThroughlineGraphPlayer` and `ThroughlineEmbed`.
- `@0xbuff/throughline/examples`: four reference artifacts with matched explanations, questions, expected answers, evidence event IDs and caveats.
- `@0xbuff/throughline/styles/throughline.css`: explicitly imported, namespaced CSS.

The separate executable is `thl` and supports `validate`, `materialize`, `check` and help. Do not add wildcard exports or require deep imports. Public `parseThl`, `compile`, `compileProgram`, `ThroughlinePlayer` and domain-tagged fences were intentionally removed.

## Repository map

- `src/v2/`: canonical schema-2 model, strict JSON, atomic replay, queries, source-preserving projections, authoring, digests and limits.
- `src/remark/`: host-neutral mdast transform. It must validate every matching `thl` node before mutating the tree.
- `src/node/`: trusted Node-only filesystem and Markdown/MDX AST parsing. Discovery must reflect **actual** code nodes, including nested containers; HTML comments and embedded syntax are not code fences.
- `src/cli/`: offline command-line arguments, validation, unreviewed materialization and check diagnostics.
- `src/react/`: native player, caption, controls, accessibility, optional narration and SSR/hydration behavior.
- `src/reference/`, `src/examples.ts`: the four schema-2 reference baselines.
- `src/styles/`: `thl-`-scoped styles and `--thl-*` tokens.
- `src/domains/`, `src/compiler.ts`, `src/dsl.ts` and other older files: **internal** v1 regression scaffolding pending later cleanup. Do not export or extend these for production.
- `scripts/`, `src/**/__tests__/`: pure, Node/CLI, packed archive, browser, framework, security and provenance checks.
- `docs/`: authoritative human-readable public architecture, grammar, CLI, integration and release guides.
- `.github/workflows/ci.yml`: quality-only, read-only CI. Publication requires the separate maintainer-controlled process.

## Implementation rules

Use Node.js 24+, pnpm 11.2.2, strict TypeScript and the committed lockfile. Keep a single canonical source of truth; do not duplicate artifact state or infer events from visuals, graph edges, notes or message timestamps. Each step commits atomically; known `null` is not unknown. Evidence must cite declared events. Maintain bounded source, state, JSON and replay work.

Markdown/MDX discovery must parse syntax trees **without running MDX or JavaScript**. Its depth-first zero-based `thl` ordinals, source content and positions must agree with the Remark host. Unqualified `thl` is the only supported fence. The opening brace selects strict JSON; prose requires an exact, separately reviewed sidecar. A new or regenerated sidecar always remains `unreviewed` until a human explicitly reviews it. No auto-approval command.

The Node host alone may read filesystem paths, using a trusted real root, strict relative POSIX locators, bounded decoding and symlink rejection. Never reflect a raw loader exception, let content select a root or execute its embedded code. Keep the root library and Remark entry free of Node filesystem, React and network dependencies. React and React DOM remain optional peers; browser-only capabilities must be detected after hydration.

Follow the project's existing naming and code style. Review third-party dependency licenses and notices; update both `package.json` and the committed lockfile when adding packages. Avoid undocumented exports, arbitrary imports and dependencies on unpublished versions. Never insert private architecture links, tokens or internal-project details in public documentation.

## Verification

Before proposing review, run the relevant checks and ensure the exact PR head has passing CI. For a full package change, verify TypeScript, local preview build/typecheck, pure/CLI/security tests, exact-SHA TL-U18 performance evidence, Chromium/Firefox/WebKit browser tests, distribution, source/license audits, an independently packed Node-only/CLI consumer, optional Remark/React/MDX integrations, mobile SSR/hydration and framework consumers. Real screen-reader evidence, including an actual tester, date, heard announcements and source/package hash, is **required before TL-U18 closure**; manual native-browser zoom remains an additional release checklist item. Keep both distinct from automated role checks, which cannot substitute for spoken output. Include negative regressions for malformed or unauthorized input, changed source hashes, unknown states and false code-node discovery.

Do not claim tests passed if not run. Do not substitute local source imports for packed-consumer proof, or infer npm publication from a successful archive build. Keep [documentation](docs/README.md) and the [changelog](CHANGELOG.md) aligned with user-facing contracts.

## Pull requests and releases

Use one focused branch and PR per accepted ticket. Give the maintainer an accurate summary of decisions, user-visible changes, security limits and actual verification. Respond to and resolve review threads only after the corrections and tests are confirmed. Leave PRs unmerged until the maintainer authorizes merging.

Do not deploy, publish, sign or move release tags, change repository visibility, archive architecture tickets, grant new credentials or rewrite Git history without the appropriate explicit approval. Release stages and the live documentation-app upgrade are separate gates. See [release guidance](docs/releasing.md), [contribution guidelines](CONTRIBUTING.md) and [security reporting](SECURITY.md).
