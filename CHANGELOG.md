# Changelog

Notable changes to Throughline are recorded here. Package versions follow
Semantic Versioning independently of the version-1 trace and program schemas.

## [0.0.2] — 2026-11-08

### Changed

- Updated the npm package homepage to the Throughline documentation site.
- Refined installation, styling, security and maintenance documentation.
- Replaced first-release-specific staging logic with reusable, version-checked
  signed-tag and provenance publishing.
- Removed obsolete public-release planning records and excluded source-only
  development documentation from the npm tarball.

No compiler, trace-schema, React player or supported export changes.

## [0.0.1] — 2026-11-08

Initial public release:

- Deterministic, bounded Markdown-authored state-trace compiler.
- Version-1 `Program` and `Trace` with diagnostics and deterministic seeking.
- Flow, bindings, binary, matrix and callstack domains.
- Optional React 19 player with keyboard playback, captions, state inspector,
  responsive layouts, reduced-motion support and opt-in sound.
- Four explicit typed ESM/CSS exports, Apache-2.0 license and 0xBUFF attribution.
