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
   authoring code. The optional title, centered diagram, borderless
   caption with step count, bottom controls and inspector disclosure
   form the presentation shell. Browser fullscreen enters and exits for
   this player element when supported; seeking never invents timing.

## Pure scene projection

The internal `projectScene(snapshot, groups, preferences)` function separates
**compiled system state** from **presentation state**. Its overview projects all
authored-visible entities and links, with deterministic node, edge and flat
lane-group descriptors. Every node retains its original entity ID; every
edge and transfer retains its authored relation ID. A `send` remains a transfer
annotation, not evidence that the destination persisted the value.

Focus mode selects explicitly chosen or focused entities, authored active
targets, and endpoints of currently visible transfers. When every target is
hidden or stale, the projection falls back to overview rather than blanking
visible system state. Authored `hide`/`show` always takes precedence over
presentation preferences, and hidden endpoints suppress their links.

View entities, relations, transfer payloads, groups, and descriptor arrays
are detached from compiled snapshot objects and frozen, including nested JSON
values. Projection copies only entities included in the view plus transfer
annotations—not the trace history—and relies on compiler-enforced JSON
depth/work budgets. The original snapshot remains mutable by neither
projection nor selection, and may be shared across compiled frames. The
React scene receives authored group layout preferences, preserving existing
`tree` and `column` lane semantics; optional hierarchy and collapse
are implemented in the later group-projection layer described below.

`projectLayout` filters the existing deterministic trace-wide fallback
geometry by a projection, retaining the stable positions, viewBox, directions,
cycles and self-loops across arbitrary seeking and selection. The React scene
uses this internal boundary without adding a package export, trace schema,
viewport control, or public selection API. Pan/zoom, automatic camera following and user-driven collapse are separate
presentation layers above projection.

## Optional spoken explanation

The React-only narration controller synthesizes authored caption text
(frame label, notes, guided chapter/causal content and explicit sends).
No new trace event or compiler schema is introduced.

While narration is enabled, speech completion drives playback ticks
instead of a fixed interval. Only the active utterance may advance
the selected trace; seeking (including to the same step) and changed
authored guidance invalidate stale callbacks. Pause/resume
controls the voice, and unavailable or failed synthesis pauses the
narration clock with an accessible error. When narration is disabled,
the existing timed playback returns. Step tones remain independent.

Browser speechSynthesis is a shared page resource. Throughline maintains a
per-engine, browser-local owner coordinator: the newest Throughline player
to begin narration takes over the global speech queue, pauses/disables the
previous player and announces displacement. Only the current owner may
call global `cancel()`, `pause()` or `resume()`; a displaced player's later
seek, toggle or unmount cannot cancel the new owner's speech. Deliberate
cancellation detaches event handlers before calling the browser API, while
unexpected `canceled`/`interrupted` errors trigger an accessible error
and pause rather than advancing the timeline. After a natural speech end,
ownership is released without global cancellation. This mechanism does not
coordinate with arbitrary third-party scripts using speechSynthesis and
cannot guarantee browser/OS voice isolation. Some voices may use
browser-managed remote services.

## Footer layout and bounded explanations

The optional narration and step-tone controls share responsive rules.
Dual-audio players use a dedicated utilities row at player content widths up
to 360px; **all** players use the generic three-row fallback at content
widths up to 300px, regardless of whether audio features are offered.
Both breakpoints use the measured player container rather than the viewport,
preserving accessible controls in narrow embedded layouts.

The React player composes its navigation, chapter selection, timeline,
and transport in one bottom bar adjacent to the diagram. Container
queries use the player container's width, not global browser size,
to split this bar into predictable rows at narrow widths; visual icon
sizes do not reduce keyboard and touch target areas. The authored
caption is a native details disclosure *after* the transport bar.
Collapsed by default, its summary remains visible with the step
title, note preview and count; the full explanation, evidence and
inspector are reachable without moving the controls. The expanded
body is bounded and independently scrollable, and the SVG references
its caption summary for descriptive accessibility.

## Accumulated authored playback progress

The internal React-only `traceProgress(trace, step)` selector scans compiled
active targets, explicit transfers and authored link-reveal events only
through the selected frame. It returns sets of participating nodes,
traversed relations and structurally revealed relations. Recomputing
from the selected frame on seeking makes rewind deterministic; memoization
by trace identity and timeline index avoids redundant work on resize.
No new trace field, compiler event, parser rule or external dependency
is introduced, and the compiler remains React-free.

The player distinguishes **persistent participation**, **current focus
and value changes**, and **a current explicit send**. It animates the
actual directed SVG connector using a normalized path length and a
new element key for each send frame. Consecutive sends can reanimate.
There is no superimposed flow path. Only a forward single step carries
`animate`; the player latches that decision per step so unrelated renders
never restart or cancel it, and seeks and rewinds settle without replaying.
Animations are declared only under `prefers-reduced-motion: no-preference`;
an override cannot be relied on because the animated selectors are more
specific. Durations derive from `--thl-step-ms`, which the player sets from
the playback speed.

Authored visibility always wins: hidden elements cannot be revived by
presentation progress. A collapsed aggregate remains dashed and reports
how many true constituent relation IDs have sent so far; it does not
animate as a single fabricated transfer. Authored `show link` is styled
as a structural reveal. Sending never claims destination acknowledgment,
processing or persistence, even if both endpoints are tinted as
participating entities.

## Authored guidance and separate alternatives

The React-only `ThroughlineGuidance` presentation contract is not serialized
into a trace or used by the compiler. Validation checks bounded chapter ranges,
real frame-event references and at least one authored state-changing event for
each causal explanation. Causal prose remains author-supplied and is not
deduced from temporal adjacency or `send` transfers. Current chapter and
explanation titles are included in the screen-reader status, with all details
and evidence in structured caption text.

`ThroughlineScenarios` takes independent compiled traces with stable IDs
and remounts the selected player on option changes. Timeline, camera,
selection, chapter context, audio and inspector presentation reset without
mutating any frame; there is no native branching graph. Root and Remark
imports remain React-free; this API is optional and only on `./react`.
No `Program` or `Trace` fields, grammar or domain behaviors change.

## Public module boundaries

| Module | Responsibility | React required? |
| --- | --- | --- |
| `@0xbuff/throughline` | Parsing, validation, compilation, tracer and types | No |
| `@0xbuff/throughline/remark` | Validate Markdown code nodes or emit literal MDX JSX nodes | No |
| `@0xbuff/throughline/react` | Accessible player, memoized source embed and optional sonification | Yes, React 19 peer |
| `@0xbuff/throughline/examples` | Public sample inputs | No |
| `@0xbuff/throughline/styles/throughline.css` | Namespaced player CSS | No |

The Remark entry point inspects mdast code nodes, checks domain-only metadata,
compiles bounded parser-owned bodies and maps ProgramError line diagnostics
through the host VFile. Statement columns are verified against the
original Markdown when available, accounting for blockquote/list prefixes.
Diagnostics without precise source provenance remain file-level instead of
pointing at an unrelated fence header or Markdown container marker. The
default mode is validation-only and does not rewrite nodes. Opt-in
`mdx` mode validates all matching fences before atomically replacing their
code nodes with `mdxJsxFlowElement` nodes containing only a literal
`source` string attribute. Invalid component names and source fail rather
than being interpreted as expressions. The plugin imports no React/DOM,
and the MDX host must register the component in its mapping. A document
with many individual fences also needs host-level aggregate size limits.

`ThroughlineEmbed` lives only in `./react`: `useMemo` compiles when its
literal source changes and passes a stable trace to `ThroughlinePlayer`.
SSR performs the same deterministic compilation as the browser, so this
bridge does not claim to eliminate client-side compilation. Untrusted
MDX documents may contain other executable expressions independent of
Throughline's literal-only transform.

The root compiler does not fetch remote data or use runtime application
services. External consumers import only the declared public exports;
deep imports are deliberately unsupported.

## Group hierarchy and projection

Optional `SceneGroup.id`/`parentId` metadata forms a static tree of uniquely
identified groups. The authoring parser validates the graph before compilation,
including forward-declared parents, duplicate identities, unknown parents and
cycles. The historic flat layout remains unchanged when no parent references
exist; nested traces re-pack their deterministic trace-wide node boxes into
parent groups using the existing edge router.

Collapse is presentation-only state in the React viewport and a pure option
in `projectScene`. The projection maps only authored-visible descendants to
a synthetic summary (which is not a real entity), deduplicates directed boundary
links while retaining each real relation ID, and leaves `send` annotations
separate from persistent `set` events. Original snapshots and values are
neither frozen nor mutated by the projection. Group drill-down changes only
camera and presentation state; replacing a trace resets group preferences.

Hierarchy is an **additive** version-1 metadata extension, not a new domain or
public entry point. Older readers can flatten optional metadata but cannot
perform hierarchical collapse; old authoring parsers reject the new grammar.
Consumers should coordinate deployment of the new hierarchy grammar with
the installed compiler and player versions.

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

Focus on the player group enables ArrowLeft/ArrowRight, Home/End and
Space without intercepting events from focused native buttons, timeline
range input, speed selector or the details inspector. Current-frame
announcements use a screen-reader status and the scene has a textual
description. A distinct alert reports refused fullscreen requests; failures
do not disable in-page playback. An unrelated trace object resets step,
speed and playing state; the reducer and timer lifecycle keep the timeline
separate from immutable frame data.

The named player stage stays mounted across empty/filled trace replacements
so ResizeObserver can keep the SVG responsive. The scoped CSS disables
transfer animations for reduced-motion users, and controls reflow for a
375px viewport. Existing packed-consumer checks exercise React 19 SSR and
client hydration, while browser tests cover keyboard, inspector, fullscreen,
reduced-motion styles and replacement regressions.

Sonification is explicitly opted into by the caller and is not
triggered merely by importing the package. A provided `sonification`
option is required to display sound controls. A running oscillator is
stopped and disconnected at most once when playback changes or when the
trace object is replaced, including with an equal-length trace. Sound is
not restarted by rerendering the same trace object. An already-ended
voice does not break cleanup. Neither playback nor
compilation records grades or authenticates learners.

## Build and trust boundaries

`tsdown` produces ESM, declarations and JavaScript source maps for
the four JavaScript exports. The stylesheet is shipped separately.
The source package uses one Node 24/pnpm CI job to run compiler and
browser tests, inspect third-party dependency license files and
install a packed tarball in independent Node, TypeScript, SSR and
Vite/React consumers.

Tests and package audits verify specific technical contracts; they do not
replace source-rights, provenance or release authorization reviews.
