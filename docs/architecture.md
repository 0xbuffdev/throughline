# Throughline architecture

Throughline separates **authored programs**, **compiled snapshots**
and **optional presentation**. This allows the compiler to run in Node
build pipelines or other offline ESM environments without React or a DOM.

## Data flow

1. **Source:** `parseThl` reads one `thl <domain>` block (optionally
   surrounded by Markdown backtick/tilde fences). It preserves source
   line positions for diagnostics; parsing an entire Markdown document
   belongs to the host application.
2. **Domain:** `compileAst` dispatches `flow` to the authored-program
   parser. The four computed adapters parse small parameter languages
   and build the same `Program` through a deterministic tracer.
3. **Validation:** `validateProgram` checks version, entity and relation
   identifiers, event shapes, finite JSON-like values, targets,
   overlapping writes, visibility and limits. Errors are surfaced
   as `ProgramError` with diagnostics.
4. **Compilation:** `compileProgram` emits a version-1 `Trace` with frame
   zero (the initial state) followed by an immutable snapshot for each
   authored beat. Each frame records active/changed targets,
   transfers, notes and any source information.
5. **Presentation:** `ThroughlinePlayer` derives a deterministic SVG
   scene from these frames and lays out nodes/links for the available
   width. Controls seek among precompiled frames instead of re-running
   authoring code. Accessible captions and the inspector expose state
   beyond the visual scene.

## Public module boundaries

| Module | Responsibility | React required? |
| --- | --- | --- |
| `@0xbuff/throughline` | Parsing, validation, compilation, tracer and types | No |
| `@0xbuff/throughline/react` | Accessible player and optional sonification | Yes, React 19 peer |
| `@0xbuff/throughline/examples` | Public sample inputs | No |
| `@0xbuff/throughline/styles/throughline.css` | Namespaced player CSS | No |

The root compiler does not fetch remote data or use runtime application
services. External consumers import only the declared public exports;
deep imports are deliberately unsupported.

## Trace format and compatibility

`Program.version` and `Trace.version` are both `1`, not the npm package
version. Each authored step yields one frame after the initial frame,
with state values, visibility and relevant event annotations.

A package upgrade that changes syntax, model types, trace meaning,
diagnostics, controls or CSS selectors is potentially breaking even
when the trace-schema version stays constant. Maintain fixtures,
regression tests and release notes for such changes.

## Work and validation limits

- Maximum source: **262,144 UTF-16 code units**.
- Program: **200 entities**, **1,000 relations**, **2,000 steps**,
  **10,000 events**.
- Program payload budget: **1,000,000 deterministic work units**.
- Expanded trace budget: **8,000,000 deterministic work units**.
- Reject unsupported or cyclic/non-JSON input values and conflicting
  overlapping writes with explicit diagnostics.

These are work/payload constraints, not exact memory or CPU
measurements. The four computed adapters apply their own domain limits;
see [the catalog](catalog.md).

## Playback and accessibility

The player uses SVG to render the active scene. It keeps entity identity
stable across changes, reserves layout space for future values,
supports responsive groups and bounded views of large values, and
provides a textual inspector. Keyboard navigation, native inputs,
live status, reduced-motion preferences and SSR/hydration behavior
are covered by browser and packed-consumer tests.

Sonification is explicitly opted into by the caller and is not
triggered merely by importing the package. Neither playback nor
compilation records grades or authenticates learners.

## Build and trust boundaries

`tsdown` produces ESM, declarations and JavaScript source maps for
the three JavaScript exports. The stylesheet is shipped separately.
The source package uses one Node 24/pnpm CI job to run compiler and
browser tests, inspect third-party dependency license files and
install a packed tarball in independent Node, TypeScript, SSR and
Vite/React consumers.

These checks are necessary but do not establish copyright ownership,
absence of all secrets, or public-release permission. The private
source history must be separately cleared before any public-source
cutover.
