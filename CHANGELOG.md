# Changelog

Notable changes to Throughline are recorded here. Package versions follow
Semantic Versioning independently of the version-1 trace and program schemas.

## Unreleased

No additional changes since the v0.1.0 candidate.

## [0.1.0] — Pending release

This version has not been published to npm. Review the
[release readiness gates](docs/release-readiness-v0.1.0.md) before publication.

### Fixed (cross-browser toolbar)

- Keep the wide playback toolbar compact in WebKit without constraining native selector height; verify the compact bar still encloses every control across browser engines.

### Fixed (narration review)

- Coordinate browser-global speech synthesis between multiple Throughline players; newer narration takes over while displaced players pause and stop owning cancellation.
- Pause with an accessible error on unexpected speech interruption instead of stalling autoplay or advancing a failed utterance.
- Restart narration for repeated seeks to the same step and replace stale speech when authored guidance changes.
- Keep the dual-audio 360px breakpoint while restoring a generic three-row fallback at <=300px content widths, covering players with no audio, only narration, only step tones, or both. Verify embedded layouts with actual browser element bounds.

### Added (opt-in caption narration)

- Offer muted-by-default browser caption narration separately from step tones, using speech-synchronized playback without new runtime dependencies.
- Pause/resume speaking with playback; cancel on seek, scenario change and unmount; preserve the original timer when narration is off.


### Changed (development preview sound)

- Expose the existing opt-in Web Audio speaker control in every local playground example and scenario comparison, initially muted. No default audio in the published React player and no new audio dependencies.


### Changed (state hierarchy and motion)

- Give the present its own color. `--thl-active` (new) marks the current send, its label and the Play button; `--thl-trail` becomes the same hue washed out for history; `--thl-change` becomes the single warm color for changed values. Previously focus and change were near-identical neutrals (about 0.02-0.03 apart in OKLab) and history was the only colored mark.
- Keep trail color on strokes and arrowheads only; visited and revealed edge labels stay `--thl-muted` so 10px text keeps at least 4.5:1 contrast.
- Reserve dashes for structure. Selected nodes and keyboard focus are an outer ring (`.thl-ring`) instead of a dashed outline and a 3px stroke that matched authored focus; the ring is the first-rect-safe sibling drawn after the node body.
- Animate only a forward single step. Seeking the timeline, rewinding and replacing the trace settle on the final frame instead of replaying the send. The decision is latched per step in the player.
- Sequence motion within a step: the arrow draws, its arrowhead and label fade in, then a changed value flashes (waiting for the arrow when the step has a send). Durations derive from `--thl-step-ms`, which the player sets from the playback speed.

### Fixed (reduced motion)

- Reduced motion did not disable the send animation: the opt-out selector `.thl-transferred .thl-edge` was less specific than the rule that set the animation, so the animation still ran under `prefers-reduced-motion: reduce`. Animations are now declared only under `prefers-reduced-motion: no-preference`, and a test fails on any unguarded animation rule.

### Changed (responsive player controls)

- Add a small consistent gap between the visualization and its optional title and bottom controls.

- Place chapter and diagram navigation beside transport controls in one compact adaptive footer, with 14px visible icons, slimmer native inputs and 40px mobile hit targets.
- Move variable-length captions below the footer as accessible step disclosures, retaining a one-line preview and a bounded independently scrollable detailed explanation.
- Keep the diagram and playback controls stationary as authored notes and evidence change between steps.


### Improved (workflow playback visual review)

- Retain authored node and connector activity across later steps; seeking
  backwards reconstructs the earlier trail without leaking future state.
- Animate each current send directly on its existing arrow path instead of
  drawing a second line; repeated sends restart the same-path animation.
- Keep shown-but-unsent links visibly distinct, preserve partial
  collapsed-group provenance and announce cumulative progress to screen readers.
  Neither transfers nor tinted endpoints imply acknowledgment or persistence.


### Changed (pre-release visual review)

- Add a source-backed Vite preview for browser inspection before publishing or deploying.
- Compact group/node/cell geometry, reduce panel whitespace, set 2px corners and 1.5rem player padding, and replace boxed icon actions with accessible borderless hit targets.
- Move chapter, viewport and hierarchy navigation below the caption into a common footer with playback controls; keep the authored narrative in the caption.
- Size the SVG stage from stable layout content rather than a 52vh placeholder; cap only dense content and retain mobile fit/zoom semantics.
- Place visible relation labels away from node values and competing labels; when space is insufficient, keep the full relation in its SVG title rather than drawing over nodes.


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
