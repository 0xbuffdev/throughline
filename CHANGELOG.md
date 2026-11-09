# Changelog

Notable changes to Throughline are recorded here. Package versions follow
Semantic Versioning independently of the version-1 trace and program schemas.

## Unreleased

### Tested

- Add packed package integration fixtures for Fumadocs Unified, Next.js App Router and Astro React islands, with pinned host versions and a release-gated integration guide.

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
