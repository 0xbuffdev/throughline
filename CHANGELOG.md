# Changelog

Notable user-facing changes to Throughline are listed here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); package versions follow [Semantic Versioning](https://semver.org/). The artifact schema has its own version number.

## [Unreleased]

## [0.2.0] — Release candidate (not yet published)

**Breaking release.** This section describes the proposed source package. Its presence does not mean that the release has been tagged, staged, approved or published to npm. See [release notes](docs/release-notes-v0.2.0.md) and [migration](docs/migration-v0.2.0.md).

### Added

- One unqualified `thl` Markdown/MDX language: strict schema-2 JSON compiles locally; descriptive prose can resolve only through a separately reviewed, source- and artifact-hash-bound sidecar.
- A strict `VisualArtifact` schema with explicit origins, entities, relations, initial known/unknown state and ordered write, topology, message and observation events.
- Deterministic atomic compilation, immutable frames, indexed inspection, value history, differences, presence tracking and source-linked evidence queries.
- Renderer-independent Graph, Sequence and State-table projections. Message sequences distinguish sent, received, acknowledged and processed phases without inventing missing activity.
- An optional React 19 `ThroughlineGraphPlayer` with responsive playback, Explain/Inspect, accessible tables, keyboard controls, reduced motion and opt-in audio.
- Four independently checked schema-2 reference models: factorial recursion, 2×2 matrix multiplication, unsigned binary addition, and hypothetical distributed checkout/retry. Each includes explanatory text, questions, expected answers and evidence caveats.
- Offline `thl validate`, `thl materialize` and `thl check` commands, plus a separate root-confined Node host. New materializations are always unreviewed until an editor approves them in source control.
- Release verification for exact-source quality evidence, browser/packed-host checks, immutable archive digests, human accessibility attestation, protected staged publishing and independent post-publication registry verification.

### Changed

- Replaced public schema-1 authoring and playback with schema 2. `compileArtifact` and the explicit `VisualArtifact` data model replace the previous domain-specific compiler contract.
- Replaced the public React `ThroughlinePlayer` with `ThroughlineGraphPlayer`; the Remark-to-MDX bridge now passes inert `artifactJson` to `ThroughlineEmbed`.
- The public examples now use the universal artifact model instead of domain-specific syntax.
- Package targets Node.js 24+ and ESM; React/React DOM 19 remain optional peers.

### Removed

- Public schema-1 `Program`/`Trace` compile APIs, legacy parser/domain exports, domain-tagged `thl flow`/`binary`/`matrix`/`callstack` syntax, and automatic compatibility routing.
- Implicit side effects from authored message phases. A message or observation is evidence, not an automatic persistent write.

### Documentation

- Rewrote the public README, contributor and security guides around the supported schema-2 model, package boundaries and honest pre-publication status.
- Added a dedicated v0.1.x-to-v0.2.0 migration guide and removed redundant historical v0.1.0 docs; the changelog remains the historical summary.
- Added a CI documentation audit for local links and Markdown code fences.

### Release status

Automated source and package checks are distinct from actual publication. The candidate still requires **real, recorded screen-reader acceptance**, maintainer release approval, signed tag, protected stage-only OIDC, final human npm 2FA, and verified registry availability. No publication is claimed here.

## [0.1.0]

### Added

- Deterministic scene projection, explicit provenance and reversible playback for authored state traces.
- Nested groups with collapse, focus filtering and drill-down; viewport pan, zoom, fit and follow-active navigation.
- Guided chapters, authored explanations, independent scenarios and examples for algorithms and distributed workflows.
- Optional narration and step sonification, with improved keyboard accessibility, reduced-motion behavior and responsive controls.
- Remark validation, an MDX embed and integration checks for common Markdown and React hosts.
- A local Vite preview and expanded testing for browser layout and nested groups.

### Changed

- Redesigned the schema-1 React player with a responsive toolbar, fullscreen mode, chapter controls and an inspector.
- Improved source-derived activity presentation without treating visual movement as a persistent write.

### Fixed

- Browser layout differences, narrow viewport controls and reduced-motion animation behavior.
- Narration ownership during seeking and unmount, viewport touch/zoom handling, group summaries and scenario transitions.

## [0.0.2] — 2026-11-08

### Changed

- Updated the package documentation homepage and installation guidance.
- Strengthened package release signing, staging and provenance checks.
- Excluded development-only documentation from the published tarball.

## [0.0.1] — 2026-11-08

### Added

- First public release of the schema-1 Markdown state-trace compiler, domain-specific traces and optional React player.
- TypeScript ESM entry points, offline compilation, keyboard playback and Apache-2.0 licensing.
