# Changelog

Notable changes to Throughline are recorded here. Package versions follow
Semantic Versioning independently of the version-1 trace and program schemas.

## Unreleased

### Hardened (TL-I16 candidate)

- Reject unsupported trace versions and missing frame arrays at the React reader boundary; this is not full validation of untrusted serialized state.
- Reuse a shared node-box set during dense edge routing and record cyclic-layout diagnostic benchmarks.
- Exercise hostile authored text in Chromium and rejected reader versions in isolated packed React SSR.
- Record source verification and outstanding manual, documentation-app and release gates.

### Added (TL-I15)

- React-only guided chapters and authored causal explanations with explicit,
  validated compiled-event provenance and accessible text parity.
- Independent scenario selector and deterministic checkout success, terminal
  failure and timeout/retry/recovery fixtures.
- Unit and Chromium regressions for evidence, chapter seeking, isolated
  scenario switching and safe/narrow-screen guidance rendering.

### Fixed (TL-I15 review follow-up)

- Provide a dedicated Restart chapter button to seek to the current chapter\'s
  first frame even when its option is already selected.
- Reconcile removed scenario IDs to the fallback instead of silently selecting
  a previously removed option on reinsertion; test empty/populated transitions.

### Compatibility

- Only additive optional React props/exports, no version-1 schema, grammar
  or legacy player-default changes.


### Fixed (TL-I14 review follow-up)

- Give undeclared lanes separate internal identities even when their names equal an explicit group ID; resolve geometry by lane name, not an ambiguous ID fallback.
- Highlight a collapsed boundary when a real constituent relation sends, without animating the entire aggregate or implying a destination write.
- Show and announce authored focus and changed state inside collapsed summaries; compile the actual published hierarchy fence as a regression fixture.

### Added (TL-I14, compatibility proposal pending)

- Optional hierarchical group IDs, explicit parent references and validated `group "Name" id foo [under parent] as row|column|tree` syntax; legacy flat groups are unchanged.
- Read-only collapsed summaries, exact provenance of aggregated cross-boundary links, nested deterministic layouts, drill-down/breadcrumb controls and regression coverage.

### Compatibility

- Program and trace schemas remain version 1; old compilers reject the new opt-in syntax, and old players may show hierarchical traces as flat groups.
- Merge of the source changes is blocked on approval of the separate group-model compatibility ADR in `context`.



### Fixed

- Correct two-finger pinch translation when zoom and midpoint movement occur
  together; focus now centers edge-positioned entities accurately.
- Bound the physical SVG height for dense, narrow diagrams while preserving
  fit-to-view aspect ratio. Let page scrolling continue at zoom limits and
  preserve native Ctrl/Meta+wheel browser zoom.
- Add unit and Chromium regressions for each TL-I13 review finding.

### Added

- TL-I13 guided viewport: bounded pan, zoom and fit-to-view with wheel, keyboard
  and touch gestures, selected-entity inspection and explicit follow-active mode.
- Manual camera precedence, trace replacement reset and corresponding unit and
  browser regressions without changing the version-1 trace schema.

### Changed

- Introduce a React-independent, view-only scene projection with stable node,
  edge and transfer provenance, selection/focus filtering, and deterministic
  fallback layout clipping. Hidden/stale focus targets retain overview,
  projection-owned data is detached and frozen, and React preserves authored
  group layout preferences. Existing playback and trace schemas are unchanged.

### Tested

- Add packed package integration fixtures for Fumadocs Unified, Next.js App Router, Astro React islands, react-markdown, mdx-bundler and markdown-to-jsx, with frozen npm consumer locks, browser hydration/interaction checks, unchanged-document regressions, and a release-gated integration guide.

### Added

- Add opt-in Remark MDX JSX output with literal source attributes and validated
  component identifiers, plus a memoized `ThroughlineEmbed` React bridge.
- Verify MDX escaping, atomic multi-fence validation, registered-component
  rendering, stable-source playback and independent packed consumers.

### Fixed

- Use verified source coordinates for Remark body diagnostics in nested Markdown;
  do not falsely attribute unpositioned semantic errors to the fence header.

### Added

- Added dependency-free `@0xbuff/throughline/remark` validation subpath for
  parser-owned `thl` fences, source-positioned build failures and unchanged
  Markdown ASTs; MDX rendering remains a separate integration.

### Fixed

- Announce native fullscreen request failures without interrupting in-page playback;
  expose player keyboard shortcuts and descriptive focus instructions.
- Make ended sonification voices safe to clean up after step changes or unmount,
  and stop/restart the cue when replacing a trace with an equal frame count.
- Add keyboard/slider, trace replacement during playback, reduced-motion CSS,
  fullscreen refusal and sound lifecycle regression coverage.

### Changed

- Redesigned the React player with an optional unbranded title, centered
  visualization, borderless caption/count, and bottom playback controls.
- Introduced neutral OKLCH light/dark/auto CSS tokens and default `0.325rem`
  radius while preserving existing trace/sonification contracts.

### Added

- Native fullscreen maximize/minimize toggle with safe unavailable-state
  handling, browser state synchronization, and responsive controls.
- Browser regression tests for shell, theme overrides, fullscreen and sound.

### Added

- Expanded the keyed reconciliation reference to include its commit beat;
  added a distributed checkout timeout, idempotent retry and recovery trace.
- Added deterministic seeking, transfer correctness, version/value-boundary,
  and browser rendering regressions for sophisticated reference examples.
- Documented teaching questions, current player limitations and the
  unsupported serialized trace-version reader gap.

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
