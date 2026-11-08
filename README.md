# Throughline

Readable state over time, authored in Markdown. Throughline compiles a trace to
immutable snapshots and renders it with a small SVG step player.

This private repository is a release candidate for the independent package.
Source extraction, licensing and external consumer tests must be reviewed before
its source becomes public or any npm release occurs.

## Package exports

`private: true`, version `0.0.0` — publishing remains disabled until the
public release is approved. Subpath exports:

| Export | Resolves to | Use it for |
|---|---|---|
| `.` | `dist/index.js` (+ `.d.ts`) | The pure engine: `compile`, the `Program` IR, the domain adapters. Never loads React or touches the DOM — safe for content CI and scripts. |
| `./react` | `dist/react/index.js` | The renderer (`ThroughlinePlayer` and friends). `react`/`react-dom` (`^19`) are optional peers. |
| `./examples` | `dist/examples.js` | `EXAMPLES` — the canonical copyable sources used by the playground and acceptance tests. |
| `./styles/throughline.css` | `src/styles/throughline.css` | The stylesheet; import it once per app (shown below). Declared a side effect. |

`files` ships `dist/`, `src/styles/`, `docs/`, and this README. All runtime imports refer to local code or independently installable third-party packages. The pure engine (`.`) is
dependency-free; `cn` is an npm dependency used only by the renderer.

## Use the player

```tsx
import { compile } from "@0xbuff/throughline";
import { ThroughlinePlayer } from "@0xbuff/throughline/react";
import "@0xbuff/throughline/styles/throughline.css";

const trace = compile(`\`\`\`thl flow
node count "Count" = 0
step "Increment"
  set count = 1
  note "One event, one visible change."
\`\`\``);

export function Example() {
  return <ThroughlinePlayer trace={trace} />;
}
```

Compile once when source changes, or during your content build. Keep the returned
`trace` stable during playback. Passing a new trace resets playback to its initial
state. React 19 is a peer dependency for `./react`; importing the pure engine from
`.` does not load React or access the DOM.

`theme` accepts `auto` (the default), `light`, or `dark`. Override `--thl-*` CSS
variables on the player to match a host theme. The CSS has no Tailwind requirement
and uses only namespaced selectors. Its color tokens use modern CSS `light-dark()`;
container queries arrange the controls on narrow screens.

## Authoring

The language identifier is **`thl`** (renamed from `viz`; old ` ```viz ` fences
do not parse). Use standard Markdown code fences — no directives, no plugins,
no custom containers:

    ```thl flow
    group "Tree" as tree
    node root "Root" in "Tree" = "ul"
    node child "Child" in "Tree" hidden = "li"
    link contains root -> child hidden
    step "Insert child"
      show node child
      show link contains
      focus child
    ```

The fence is ordinary Markdown: the language is `thl`, the domain
(`flow`, `bindings`, `binary`, `matrix`, `callstack`) is the first word of the
info string, and everything between the fences is the program. Standard fences
work with ordinary Markdown editors and render as copyable code with no
Throughline integration registered; `:::thl` is not part of the syntax.

- `flow`: explicit state, relationships, and steps.
- `bindings`: references, mutation, and rebinding.
- `binary`: binary addition with carries.
- `matrix`: matrix multiplication.
- `callstack`: calls and returns.

See [grammar](docs/grammar.md), [domain catalog](docs/catalog.md), and
[adapter authoring](docs/authoring.md). `EXAMPLES` from `./examples` supplies the
same copyable sources used by the playground and acceptance tests.

## Composition and interaction

Groups support `row`, `column`, and `tree`. Omitted arrangements use `row`.
Groups wrap to available width; text is never shrunk to fit a desktop scene onto
a phone. Node dimensions reserve the largest values across the trace, including
future hidden nodes, so stepping preserves spatial identity. This can leave
intentional empty space before an allocation appears.

Focus has a teal outline; actual changed values have an amber fill and outline.
Transfers draw for 350 ms and remain highlighted while paused. Their payloads
appear in the caption. Reduced motion removes the draw animation.

Large arrays, matrices, records, and stacks use bounded windows containing the
first focused position. A window notice states the range; **Inspect state** exposes
every current value as selectable text. Long individual cell values are ellipsized
with their full text in the SVG title and inspector. Multiple distant foci may
span more than one window. Layout is deterministic and suited to small explanatory
scenes; it is not a general graph editor or large-network layout engine.

Focus the player and use Left/Right, Home/End, or Space. Native buttons, the
range input, and speed select keep their own keyboard behavior. Each step has a
semantic SVG label and live announcement. Audio controls appear only when
`sonification` is supplied; sound indicates stage progression, without inferring
memory cost or contention from visual focus.

## Build and verify

`compile(source)` accepts one `thl <domain>` block, with optional Markdown
backtick or tilde fences (three or more matching characters). Extra header
options and content after the closing fence are errors. Blank lines and CRLF
are preserved for diagnostics. A missing closing fence runs to end of input.

A host Markdown parser can call `compileAst({ kind: "flow", lines,
source: { line: 20 } })` directly. `lines` contains only the fence body;
`source.line` is the header's one-based document line. The default header line
is 1. The engine does not parse entire Markdown documents. `ThlBlock` now has
only `kind`, `lines`, and optional `source`; the unused `raw`, `args`, and
`props` fields were removed from the authoring API.

`COMPILATION_LIMITS` exposes the fixed source, program, and trace ceilings.
Source is limited to 262,144 UTF-16 code units. Program data is limited to
1,000,000 budget units; expanded trace snapshots to 8,000,000. A unit counts
one UTF-16 code unit in strings/keys, with eight units per scalar/container.
Repeated values count each time they would appear in JSON. These are
deterministic payload/work limits, not exact heap-byte measurements. Cycles
and non-JSON data fail with `ProgramError` before serialization.

Computed adapters check their parsed input before constructing labels or
expanding steps. The programmatic `tracer()` enforces counts and data budgets
as it records. Values passed to `node`, `set`, and `send` are captured immediately;
later mutations cannot rewrite history. `get()` and `program()` return detached
data. A step callback is synchronous and commits atomically; nested recording
and writes through a saved step writer after its callback returns are errors.

From this repository:

```sh
pnpm install
pnpm typecheck
pnpm test:run
pnpm exec playwright install chromium
pnpm test:browser:run
pnpm build
pnpm audit:pack
pnpm audit:browser
```

The `tsdown` build emits ESM, declarations, and JavaScript source maps for the
three public JavaScript entries. Its post-build check verifies exported files,
missing declarations, accidental test output, and simple runtime imports. The
optional React peer remains external, and the stylesheet stays an explicit
consumer import. Build tooling is declared directly by this repository.

A successful build is not a public-release test: independently install the
packed archive in clean Node, React/browser, SSR, and TypeScript consumers
before publishing v0.0.1.

## Current limitations

- **Unpublished.** `private: true` and version `0.0.0` are intentional
  until source/rights review, licensing and release approval.
- **Consumer integration.** Hosts decide when to compile authored traces. No
  standalone CLI or SVG export is included.
- **Authored traces only.** Automatically recorded executions are unsupported.
- **Bounded programs.** 200 entities, 1000 relations, 2000 steps, 10000 events
  per program; overlapping writes to the same path in one step fail at compile
  time (`docs/grammar.md`).
- **Bounded adapters.** `binary`: 1–16 unsigned bits; `matrix`: up to 4×4, copy
  and dot-product only; `callstack`: factorial, depth ≤ 6; `bindings`: no
  expressions or methods besides `push` (`docs/catalog.md`). An info string
  naming any other domain fails compilation with the supported list.
- **Small explanatory scenes.** Deterministic, bounded-window layout; not a
  general graph editor or large-network layout engine. Text is never shrunk to
  fit a desktop scene onto a phone.
- **Motion and audio.** Reduced motion removes draw animations. Audio controls
  appear only when `sonification` is supplied, and sound marks stage
  progression — it does not infer memory cost or contention from visual focus.
