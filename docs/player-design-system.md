# Throughline player design system — TL-P01

**Status:** Proposed source design and browser-review fixtures; implementation of the new player shell is TL-P02, graph TL-P03, and sequence/Inspect TL-P04. A reviewed design is not evidence that the code or release is finished.

**Authority:** Throughline ADR-0010 and Throughline Specification 0008 (requirements PLR-001–PLR-015). The schema-2 model and query projections remain owned by Throughline Specification 0004.

## Design objective

The player explains one **modeled transition** at a time. A reader should see the actual system visualization, understand the current step, move backward or forward and inspect what is known without studying the authored JSON or opening multiple settings panels.

The player belongs to arbitrary host applications: no required logo, brand color, remote font, animation, network call, or host-level CSS reset. The Playground may have its own branding around it, but that branding is not part of the package.

The first release is **not** a general-purpose matrix/stack/canvas visualizer. The accepted schema-2 foundation supports graph, sequence and state-table projections; specialized visual grammar remains TL-U21–TL-U24. An unavailable view uses an honest state/table fallback.

## The five composition regions

| Region | Default content | Interaction and owner | Why |
| --- | --- | --- | --- |
| 01 Orientation | Optional meaningful title, compatible view, visible Inspect action | Host title + presentation selection | Establish context without taking over the scene |
| 02 Scene | Largest available area, source-linked graph/sequence/state | Pure projection/geometry + reader camera, grouping, entity selection | Explain the modeled state and evidence visually |
| 03 Explanation | Current step title, concise note, **one** step counter | Compiler-owned frame + authored text | Answer “what happened?” without menu navigation |
| 04 Transport | Previous, play/pause, next, discrete seek | Timeline state only | Predictable media-like interaction |
| 05 Evidence | Contextual Inspect with exact values, source events and epistemic limits | Read-only query, presentation focus | Answer “what do we know?” without abandoning scene |

At 260–375 CSS px, transport may use two lines but the essential actions remain visible. Inspect is a stacked region or controlled overlay with a dismiss/focus-return mechanism. At 768–1280px, Inspect may sit beside the graph, but must never mutate or replace the canonical frame.

### Information priority

**Always visible:** modeled scene, step title and count, previous/play-pause/next, timeline, view identification, and Inspect entry. **Discoverable secondary controls:** speed, jump-to-step, fullscreen, camera fit/zoom, group selection and optional narration. **Only when relevant:** exact JSON, source-event references, claim provenance, advanced history and selected-entity details.

The design avoids duplicated step counts, a compulsory branded banner, a permanent settings sidebar and decorative algorithm panels. It explicitly avoids tiny controls at narrow widths: the recommended primary touch target is at least 40×40 CSS px (WCAG 2.2 AA target-size minimum is different; see the specification).

## Player-scoped token proposal

The current `src/styles/throughline.css` declares local `--thl-bg`, `--thl-panel`, `--thl-surface`, `--thl-text`, `--thl-muted`, `--thl-line`, `--thl-focus`, `--thl-focus-bg`, `--thl-change`, `--thl-change-bg`, `--thl-control-bg`, `--thl-control-hover`, `--thl-radius`, `--thl-active`, `--thl-trail`, `--thl-trail-bg` and motion durations. Several v2 selectors append directly to the earlier player stylesheet. **TL-P01 does not replace these runtime tokens:** TL-P02 must consolidate them while preserving documented host overrides.

The following are design candidates, not implemented package variables:

| Intent | Light default candidate | Dark default candidate | Semantics |
| --- | --- | --- | --- |
| Canvas `--thl-bg` | `#fafafa` | `#121821` | Subdued scene workspace |
| Surface `--thl-surface` | `#ffffff` | `#1b212c` | Legible frame or contextual panel |
| Main text `--thl-text` | `#171717` | `#f4f5f6` | Control, step and value text |
| Secondary text `--thl-muted` | `#626b78` | `#aeb7c7` | Descriptive text; contrast must be measured |
| Line `--thl-line` | `#e4e7eb` | `#394557` | Light separations, never sole status cue |
| Focus `--thl-focus` | `#2563eb` | `#a6c5ff` | Keyboard and selection focus, non-color ring |
| Active evidence `--thl-active` | `#0f766e` | `#77d0be` | Explicit modeled *current* fact only |
| Changed state `--thl-change` | `#b45309` | `#f7bb73` | Actual explicit write, not inferred persistence |

Rounded panels around 8–12px are suitable for surfaces; graph nodes should use consistent but restrained shapes. A 4px-based spacing scale (`4/8/12/16/24px`) is the default. Proposed text scale: main controls/caption 14–16px, supporting text 12–14px, with text zoom preserving access; code-like values use system monospace. The player must **not** load fonts remotely.

Semantic coloring **never** substitutes for text or structure. `Unknown`, `Absent`, `Known: null`, `Not modeled`, and actual event types must be readable as text. Selection and focus need independent rings/borders; changed facts can use a label/badge and explicit evidence links. These token values are a starting point for measured contrast review, not self-certified WCAG compliance.

### Component boundary for TL-P02

```text
ThroughlinePlayer (React shell; presentation state only)
├─ Header: meaningful title? + view + Inspect entry
├─ SceneViewport: compatible pure ViewDescriptor, camera and selection
│  ├─ GraphRenderer (TL-P03)
│  ├─ SequenceRenderer / StateTableRenderer (TL-P04)
│  └─ ContextualInspector (TL-P04)
├─ StepExplanation: label + note + source-backed count
└─ TimelineControls: previous + play/pause + next + discrete seek
   └─ SecondaryOptions: speed, zoom/fit, fullscreen, optional speech
```

**Source of truth:** `VisualArtifact` → `compileArtifact` → immutable `CompiledTrace` → `inspectTrace` / `projectView` → presentation. Only the source-backed projection determines the meaning of nodes, edges, message phases and values. The shell may select, seek or focus; it may not produce additional semantic events.

## Review fixture matrix

The [Playground player design lab](../playground/README.md#player-design-review-tl-p01) runs the **real current** player using the four checked reference artifacts, at reproducible host widths and themes. The static anatomy study is visibly labeled as proposed and **must never be counted as a source player screenshot**.

| Dimension | Coverage |
| --- | --- |
| Reference | Factorial, matrix, binary, hypothetical distributed checkout |
| Container width | 260, 320, 375, 768, 1280 CSS px |
| Theme | Light, dark; manually inspect system/host conflicts |
| View | Graph, sequence, state table where compatible; incompatible selection must not invent facts |
| Frame | Initial, middle, last (using real native transport/keyboard) |
| Detailed state | Graph entity selected, Inspect open, long entity/step labels, no explicit title, invalid input refused |
| Other manual conditions | 200% text, browser zoom up to 400%, reduced motion, keyboard-only, host style conflicts, forced colors, unsupported fullscreen/narration |

The fixture variants are constructed from each validated reference by adding **presentation labels only**, or deliberately avoiding compilation for an invalid case. They do not add synthetic state transitions, acknowledgements, causal links or derived arithmetic. Each source is compiled with the same `compileArtifact` function used by production consumers. The design lab allows actual selection/step navigation through the native player.

## Visual review and reproducible fixtures

1. Check out the dedicated TL-P01 source branch **after** the foundational Playground branch. Install with `pnpm install --frozen-lockfile`.
2. Run `pnpm preview:typecheck`, `pnpm test:run` and `pnpm preview:build`. Open `http://localhost:5173/?player-lab=1` after `pnpm dev`.
3. Run `pnpm audit:player-design` after the build. It launches a real Chromium browser against the built Vite host and writes exact fixture PNGs and a JSON manifest to `.release-evidence/player-design/`. These are not fake images, normalized SVG files or guessed layouts.
4. Review both the **Live player** and clearly labeled **Layout study** at each target width. An image from the Layout study is design evidence only. Check controls, step counts, long labels, scene legibility, evidence status, view switching, focus and horizontal overflow.
5. Manually exercise the current player, including graph selection, middle/final seek, Inspect and keyboard focus; record shortcomings as TL-P02–TL-P04 issues. Run the narrow embed with browser text zoom and screen readers separately. A green automated run does not establish manual accessibility.
6. Review the real screenshots attached as CI artifacts. Record accepted baseline hash, any rejected states and visual approval in the P01 source PR. Do not silently bless new image differences. This ticket only establishes the baseline; production visual regression enforcement belongs to TL-P05.

### Review questions

- Can an unfamiliar learner locate the modeled change without scrolling through developer settings?
- At 260px, are the minimum controls and explanation genuinely visible? Is horizontal scrolling confined to a diagram, not the whole player?
- Is there exactly one authoritative counter and a predictable place for the current explanation?
- Can a reader open Inspect while retaining frame, entity and visual context?
- Can every arrow or highlighted state be traced back to a declared source event rather than an inferred message?
- Does the player remain neutral and legible in hosts with a different light/dark palette?
- Which layout or interaction problems are confirmed by **real screenshots**, and which remain untested?

## Design research and accepted constraints

- [Nielsen Norman Group, Progressive Disclosure](https://www.nngroup.com/articles/progressive-disclosure/) and [10 usability heuristics](https://www.nngroup.com/articles/ten-usability-heuristics/): visible system status, reader control, consistent navigation and minimal primary chrome.
- [W3C WCAG 2.2](https://www.w3.org/TR/WCAG22/): keyboard access, reflow, text resize, status, non-text contrast and target-size minimum with exceptions.
- [WAI-ARIA slider pattern](https://www.w3.org/WAI/ARIA/apg/patterns/slider/): discrete seek, Home/End and meaningful value text.
- Accepted Throughline ADR-0006 and Specification 0004: model, timeline and presentation remain separate; the state table is the truthful fallback.

## Implementation and release boundaries

TL-P01 contains **design decisions, a token study, a real-source review surface and screenshot capture machinery**. It is deliberately not a new player, not the public `ThroughlinePlayer` component, not a new graph renderer, and not an npm release.

TL-P02 reworks the shell and transport and adopts the reviewed tokens. TL-P03 changes the graph scene; TL-P04 changes sequence/state/Inspect; TL-P05 adds approved visual regression and final packaged-player QA. After these merge, the final candidate requires a fresh TL-U18 actual screen-reader check before the held TL-U19 publication PR can be merged and any signed release/publishing action authorized.

This work depends on the new public authoring Playground PR. The TL-P01 implementation PR is stacked on that branch to avoid independently duplicating its changes; merge the Playground parent first and retarget/rebase this PR before inclusion in main.
