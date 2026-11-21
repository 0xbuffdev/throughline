# Changelog

All notable changes to Throughline are recorded here. Package versions follow
[Semantic Versioning](https://semver.org/) independently of schema-2
`VisualArtifact.schemaVersion`. Changes are grouped using
[Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

### Changed

- Port the compact React player layout with measured, stable graph cards,
  centered rows, structural DAG placement and distinct parallel routes while
  retaining the existing palette and connector appearance. Dense scenes open
  at readable scale with pan/zoom and an explicit full-scene Fit action.
  Authored focus following is optional and pauses for manual navigation.
  View tabs reflect supported projections. Add timeline scrubbing, bounded
  Options and a responsive inspector side panel/mobile bottom sheet.
  Replace repeated node write labels with a compact update marker; exact values,
  paged structured data, changes and evidence remain in inspection.
  Sequence lanes remain stable from the initial frame; only explicit sends draw
  directional arrows, with forward-only motion. Other phases use labeled markers.
  Restore semantic State tables and contain wide evidence tables locally.

### Added

- A test-only Mermaid 12.3.0 feasibility host and source-linked Graph/Sequence
  adapters, bounded rendering and motion regressions, dependency inventory and
  reproducible browser measurements. Production player rendering and package
  exports are unchanged; renderer cutover and release acceptance remain open.
- TL-U18 establishes an exact-head, machine-readable schema-2 release-quality gate: deterministic small/moderate/near-limit fixture hashes and compile/index/query/projection/geometry timings with runner metadata; a seeded negative-input sweep; 260px keyboard/semantic-accessibility browser regressions; separately attested Chromium/Firefox/WebKit runs; a checked independent packed SSR consumer at 260/320/375 CSS px; and CI artifacts plus a read-only evidence verifier. Results use hard correctness/resource budgets, not invented CPU or learning-outcome claims. Maintainer review caught incomplete merge-result CI, 12 repeatedly sampled attack strings and vacuously passing empty-edge geometry: these are corrected with a full proposed-merge CI replay, 144 unique seeded malformed inputs (12 mandatory classes) and an all-edges-preserved bounded-geometry gate. Real screen-reader acceptance is **still pending TL-U18** and cannot be reclassified as an automatic DOM test or postponed to TL-U19 without an accepted spec amendment; a dated SHA-bound human test template is provided. Native zoom is also a manual release check. The previously stale manual publisher export map now checks the schema-2 Node entry and `thl` binary. No package was published.
- TL-U10 adds a separately packed Node 24+ `thl` CLI with strict
  `validate`, `materialize` and `check` commands. Materialization computes
  LF-normalized source and canonical artifact SHA-256, creates ordered
  version-1 sidecars as **unreviewed**, and requires separate editorial review
  before check/production. Strict JSON and sidecar errors use stable codes
  with source line/ordinal where known. The independent `./node` host entry
  confines file reads to a trusted root, rejects symlink/path escapes and
  supplies reviewed sidecar loading for actual Remark/MDX integrations.
  No AI, React or Node filesystem dependency reaches the pure root entry.
  CLI and Node host have dedicated security tests and independently packed
  consumer proof; the real documentation-app deployment is TL-U20.
  TL-U10 review hardening replaced the heuristic CLI scanner with a
  non-evaluating CommonMark/MDX mdast parser, ensuring nested list/JSX
  code nodes are validated while comments and expression-like strings
  are excluded. Strict parser dependencies are frozen in the lockfile,
  tested with nested-source coordinates and through the packed CLI.
- TL-U09 replaces the published example catalog with four domain-neutral
  typed schema-2 reference artifacts: factorial call stack, 2×2 matrix
  multiplication, unsigned binary addition and a hypothetical distributed
  checkout retry. Each includes static explanation, source-cited comprehension
  questions, expected answers and caveats. Independent truth tests verify
  arithmetic, stack transitions, payment uncertainty/persistence order,
  deterministic JSON and source provenance across graph/sequence/history.
  The development playground now uses the native schema-2 React player.
  Historical schema-1 examples remain internal test scaffolding only, not
  a public catalog or compatibility adapter.
- Added TL-U08 single unqualified `thl` fence authoring. Strict schema-2
  inline JSON validates and compiles offline; inert prose requires an exact
  reviewed materialization bound to LF-normalized source SHA-256 and canonical
  artifact SHA-256. Sidecar locators are document + zero-based `thl` ordinal,
  with traversal-safe paths, closed manifest schema and no implicit AI/network.
  Remark/MDX replaces validated nodes with literal schema-2 `artifactJson`
  and the React embed now renders the native v2 graph/sequence/Inspect player;
  unrelated Markdown remains unchanged. This is an intentional breaking source
  change, not a v1-compatible adapter. The CLI remains a separate TL-U10
  ticket; the reference migration is implemented under TL-U09.
- Added TL-U07 pure `projectInspection` for typed source-linked chapter
  context, previous/current state, exact explicit `diff`, nested-path
  `history`, modeled relation transfers, origin-labeled causal
  dependencies and editorial claims with future-evidence limits. Native
  schema-2 React players now have accessible Explain/Inspect switching,
  safe path queries and source-event navigation without mutating modeled
  state or inferring receipt, persistence or causality. Review hardening
  exposes explicit observation cells and optional message payloads as
  non-persistent evidence, provides exact chunked JSON disclosure after
  truncated state previews, and limits rendered claims to 12 per page
  with independent 12-source-citation pages and paged dependencies.
- Added TL-U06 pure source-linked message-sequence projection with
  deterministic graph/sequence/state-table auto-choice, explicit four-phase
  message-ID correlations and a bounded, accessible React evidence timeline.
  Missing acknowledgements remain unmodeled instead of being marked lost;
  timeout observations/writes are not synthetic message phases. Frame/selection
  identity persists across views, the default player honors artifact view
  hints/automatic message selection, and manual initial sequence SSR remains
  available via `ThroughlineGraphPlayer.initialView`. Review hardening also
  preserves atomic same-step message semantics, indexes relation provenance
  once, and pages correlation cards in fixed 120-item windows.
- Added the pure schema-2 `projectView` graph projection, static nested-group
  collapse with complete semantic source provenance, a truthful state/event
  table fallback and the dedicated accessible
  `ThroughlineGraphPlayer` React component (TL-U05).
  Only explicit modeled `sent` events animate workflow connectors; observations,
  receipts and processed phases never invent persistent writes or sends.
  Native v2 playback reuses transport, speech ownership and pure edge routing
  without converting schema-2 artifacts into schema-1 traces.
- Added schema-2 `inspectTrace` indexed pure state/diff/history,
  entity-event, relation-transfer, explicit-dependency and claim queries
  (TL-U04). Distinguishes absent/unknown/known-null values, preserves
  provenance and rejects forged or deserialized compiled traces; no legacy
  adapters or inferred causal relationships.
- Added schema-2 `compileArtifact` with atomic step replay, copy-on-write
  persistent values, exact event-ID frame checkpoints, modeled topology,
  no-false-send/observation semantics and the 8M expanded-work ceiling (TL-U03).
  The existing v1 authoring/player is not a compatibility target.
- Introduced the independently validated semantic schema-2 `VisualArtifact`,
  strict duplicate-key JSON reader, deterministic serialization and
  deeply detached/frozen validation boundary (TL-U02). This does **not**
  yet migrate the v1 compiler, Markdown authoring or player.
- Documented the accepted v2 trust, resource, evidence and no-compatibility
  boundaries in `docs/schema-v2.md`.


### Changed

- Reorganized the React player into a responsive header, chapter navigation,
  diagram, playback bar and caption. Existing scene tokens and corner sizes
  apply across embed widths. Player options groups chapter navigation,
  the former View controls, and display and audio settings.
- Fullscreen centers the diagram between the header and bottom playback
  controls. Expanding Details makes room below the controls.
- Replaced the timeline slider with a step counter and a **Go to step**
  action under Player options. Custom styles targeting the old timeline
  track and thumb can be removed.
- Added a 768px tablet layout to the playground's viewport picker.

### Fixed

- Show the step note once when caption details are expanded.

## [0.1.0]

### Added

- React-independent scene projection with deterministic entity, link and
  transfer provenance, including focus filtering and stable seeking.
- Optional nested groups, validated parent references, collapsible summaries,
  drill-down controls and breadcrumbs; existing flat groups remain valid.
- Bounded pan, zoom, fit-to-view and follow-active navigation with mouse,
  keyboard and touch controls, plus selected-entity inspection.
- Authored guided chapters, evidence-backed explanations and independent
  scenario comparisons, including deterministic distributed-checkout examples.
- Separate opt-in browser caption narration synchronized with playback;
  step-tone sonification remains optional and off by default.
- Build-time Remark validation via `@0xbuff/throughline/remark` and opt-in
  literal-source MDX conversion with the React `ThroughlineEmbed` component.
- Native fullscreen support and a source-backed Vite playground for visually
  inspecting examples and responsive playback during development.
- Tested integration patterns for Fumadocs Unified, Next.js App Router, Astro,
  react-markdown, mdx-bundler and markdown-to-jsx.
- Expanded keyed React reconciliation and distributed checkout reference traces.

### Changed

- Redesigned the optional React 19 player with responsive step-based controls,
  accessible detail disclosures, a state inspector and light/dark/auto themes.
- Updated player CSS tokens to distinguish current activity, accumulated
  history and changed values; selection uses a separate focus ring.
- Playback now animates only a single forward step; seeking, rewinding and
  trace replacement settle directly on the target frame.
- Persistent activity trails and collapsing groups retain the underlying
  authored relation and event provenance without implying durable writes.

### Fixed

- Prevented a compact playback-toolbar height discrepancy in WebKit while
  preserving visible, usable controls across engines and narrow widths.
- Corrected reduced-motion behavior so send animations are disabled when
  the operating system requests reduced motion.
- Improved narration ownership across multiple players, speech interruption
  handling, repeated seeking and stale-utterance cancellation.
- Restored responsive control layouts at 300px and smaller widths across
  combinations of narration and sonification options.
- Corrected two-finger pinch translation, edge-positioned camera focus and
  scroll behavior at zoom limits.
- Fixed collapsed-group summaries, name collisions between lanes and explicit
  group IDs, and authored focus/changed-state announcements.
- Fixed chapter restart, removed-scenario fallback, fullscreen failure
  announcements, and audio cleanup during trace replacement or unmount.
- Improved Remark diagnostics for nested Markdown and validated input
  boundaries for unsupported serialized trace versions.

## [0.0.2] — 2026-11-08

### Changed

- Updated the npm package homepage to the Throughline documentation site.
- Refined installation, styling, security and maintenance documentation.
- Replaced first-release-specific staging logic with reusable, version-checked
  signed-tag and provenance publishing.
- Removed obsolete public-release planning records and excluded source-only
  development documentation from the npm tarball.

## [0.0.1] — 2026-11-08

Initial public release:

- Deterministic, bounded Markdown-authored state-trace compiler.
- Version-1 `Program` and `Trace` with diagnostics and deterministic seeking.
- Flow, bindings, binary, matrix and callstack domains.
- Optional React 19 player with keyboard playback, captions, state inspector,
  responsive layouts, reduced-motion support and opt-in sound.
- Four explicit typed ESM/CSS exports, Apache-2.0 license and 0xBUFF attribution.
