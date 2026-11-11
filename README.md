# Throughline

**Readable state over time, authored in Markdown.**

Throughline compiles small, explanatory state traces into deterministic,
versioned snapshots. Its optional React player makes each change visible as
a step-by-step SVG scene—with keyboard controls, accessible descriptions,
responsive layouts and opt-in sound.

Use it to explain what changes during an algorithm, a data-structure
operation, a recursive call or a system workflow. Throughline does not
execute arbitrary code or require an account, server, network connection
or application-specific runtime.

## Features

- **Author in Markdown:** write a `thl` code fence with explicit, named steps.
- **Deterministic snapshots:** compile once, then seek through immutable
  frames without re-running the authored program.
- **Five supported domains:** hand-authored `flow`, reference `bindings`,
  `binary` addition, `matrix` multiplication and recursive `callstack`.
- **Remark validation and MDX output are optional:** validate fenced traces without changing Markdown, or emit registered React components from MDX.
- **React is optional:** use the pure compiler from Node or other ESM
  environments without loading React or browser globals.
- **Accessible playback:** keyboard navigation, step captions, a state
  inspector, reduced-motion support and explicit CSS/theme controls.
- **Bounded by design:** source, state, event and expansion limits provide
  predictable rejection rather than uncontrolled trace growth.
- **Complex reference traces:** inspect keyed React reconciliation and a
  distributed checkout with a lost acknowledgement, retry and recovery.

## Preview the current React player locally

The development-only Vite playground loads **this checkout's source files**,
not the last published npm package. It lets maintainers inspect real behavior
before approving a release. The app is not included in the npm archive and
does not require deployment or an account.

Use Node.js 24+ and pnpm 11.2.2:

~~~sh
pnpm install --frozen-lockfile
pnpm dev
~~~

Open **http://localhost:5173** in a browser. Choose Reconciliation,
Shared references, Matrix, Distributed checkout, or **Compare checkout
outcomes**; switch the player between light/dark/system, then between full
width and a 375px mobile viewport. The checkout comparison starts with the
retry/recovery scenario and offers successful and terminal-failure outcomes.
Expand **View authored trace source** to check the exact events on display.

For a remote development environment (e.g. GitHub Codespaces), start
\`pnpm dev --host 0.0.0.0\` and use the environment's forwarded port 5173
rather than treating localhost on your own computer as the remote server.
Keep forwarded access private while reviewing traces. If running from the
unmerged preview branch, check out \`feat/local-player-preview\` first.

~~~sh
pnpm preview:typecheck
pnpm preview:build
~~~

These checks typecheck and bundle the *preview*, independently of the library
build and normal compiler/browser tests. Nothing here creates a Git tag,
publishes to npm, or deploys documentation. A browser visual/manual
accessibility review is still required; build and automated browser tests
cannot attest to visual correctness.

## Installation

Install the package from npm:

~~~sh
npm install @0xbuff/throughline
~~~

For the optional React player, use React 19 and React DOM 19 in the
consuming application:

~~~sh
npm install react@^19 react-dom@^19
~~~

The package targets Node.js 24 or later, uses ESM and ships TypeScript
declarations. React is not required for the root compiler import.

## Quick start

### Compile a trace

~~~ts
import { compile } from "@0xbuff/throughline";

const source = [
  "```thl flow",
  'node counter "Counter" = 0',
  'step "Increment"',
  "  set counter = 1",
  "  focus counter",
  '  note "Counter now holds one."',
  "```",
].join("\n");

const trace = compile(source);

// Frame 0 contains the initial state; later frames capture authored steps.
console.log(trace.version);       // 1
console.log(trace.frames.length); // 2
~~~

A `thl flow` block declares entities and relationships first, followed by
named steps using operations such as `set`, `focus`, `note`, `send`,
`show` and `hide`. Markdown fences are optional when calling `compile`
directly, but each source must identify its `thl` domain.

### Render it with React

~~~tsx
import { compile } from "@0xbuff/throughline";
import { EXAMPLES } from "@0xbuff/throughline/examples";
import { ThroughlinePlayer } from "@0xbuff/throughline/react";
import "@0xbuff/throughline/styles/throughline.css";

const trace = compile(EXAMPLES[0].source);

export function TraceDemo() {
  return <ThroughlinePlayer trace={trace} title="React Reconciliation" theme="auto" />;
}
~~~

Import the optional stylesheet once in the host application. The player
accepts an optional `title` (omitted when absent), and `light`, `dark` or
`auto` themes. The borderless, pale-light/charcoal-dark shell centers the
visualization above a caption with an exact `Step N of M` indicator and a
bottom control bar. Playback is **step-based**: there is no invented media
time. The optional state inspector and authored causal explanations remain in the caption; chapter navigation and all player navigation/transport controls sit below it.

The shell, group boxes, nodes, cells and form inputs use a compact default
`--thl-radius: 0.125rem` (2px at a 16px root font size), with 0.5rem inner
spacing and 1.5rem player padding. Node strokes default to
`--thl-node-border-width: 1.25px`. Icon-only buttons have no visible boxes,
but retain at least 2.5rem interactive targets and visible keyboard focus.
 Host overrides are scoped to the
player; for example, with `className="my-trace"` and a stylesheet loaded
after the package CSS:

~~~css
.thl.my-trace {
  --thl-radius: 0.5rem;
  --thl-bg: light-dark(oklch(0.98 0 0), oklch(0.14 0 0));
}
~~~

The `--thl-bg`, `--thl-panel`, `--thl-surface`, `--thl-text`,
`--thl-muted`, `--thl-line`, `--thl-focus`, `--thl-change`,
`--thl-trail`, `--thl-trail-bg` and control tokens belong to the player, not the host's `:root` or `.dark`.

The bottom-right **Maximize player** button enters native browser fullscreen
and changes to **Minimize player** while active, including when fullscreen
changes via Esc. It is disabled where the API is unavailable or blocked.
Sound controls appear only when the host supplies `sonification`. The
inspector remains optional, the trace reference should remain stable while
stepping, and complete custom stylesheets must retain accessibility.

### Playback accessibility

Focus the **Visualization player** to use Left/Right arrows for stepping,
Home/End to jump to the first/last step, and Space to play or pause. Native
buttons, the labeled timeline slider and the playback-speed selector keep
their own keyboard interactions; shortcuts do not steal keystrokes from
focused controls. Each frame has an accessible text summary. **Inspect
state** is a native disclosure exposing complete visible values.

Playback starts paused at the first frame. Changing to a different trace
object resets the step, playback and speed; passing a stable trace object
during ordinary renders avoids unnecessary resets. The timeline describes
**steps**, not elapsed media time. At narrow widths the controls rearrange
without a separate horizontal scroll area. Transfer animations are disabled
under `prefers-reduced-motion: reduce`.

Sound is off by default, and the host must provide a `sonification` option
before the user can enable it. A host can explicitly start enabled using
`sonification={{ enabled: true }}`. A new trace object restarts its initial
sound cue and stops the previous one, even when both traces have the same
number of frames; rerendering with the same trace does not replay audio.
A refused fullscreen request is
announced to assistive technology; playback remains available in-page.
Browser support and host policies determine whether fullscreen can start.

## Trace reader compatibility

`ThroughlinePlayer` expects a compiler-produced version-1 `Trace` and rejects
unsupported versions or a missing `frames` array at runtime. This is **not**
a complete validator for arbitrary serialized snapshots. Treat external JSON
as untrusted and validate it at the host boundary; prefer compiling bounded
source with `compile`.

The hardening test and release-evidence scope are documented in
[release-hardening](docs/release-hardening.md).

## Persistent workflow progress

The React player retains a cumulative trail through the **selected** step.
Focused or explicitly written nodes and endpoints of authored sends stay
highlighted, along with arrows that have actually transferred an authored
message. The **current arrow itself** draws when a send occurs; there is
no second path painted on top of it. The newest focus and data changes
still have stronger emphasis than previous activity.

Only an explicit `send` highlights a message path. For instance, setting
a server status **does not** highlight the response link until a separate
authored response send occurs. A `show link` marks a structural connection
with a dashed style, not a delivery. Highlighting an endpoint means it
participated in the authored sequence; it does not imply that a request
was accepted or that the destination persisted data.

The trail is derived from the compiled trace at each seek position.
Rewinding removes future progress; replaying restores it. Hidden nodes and
links stay hidden; collapsed groups retain original relation provenance
and distinguish partial aggregates. Switching scenarios or replacing
the trace resets the progression. Reduced-motion preferences retain
a fully highlighted arrow without drawing animation. Screen readers
get an authored-progress count with the current step.

## Guided viewport navigation

The React player opens with a fit-to-view overview. The compact bottom toolbar
provides Zoom in, Zoom out (1× to 4×), Fit to view, a native Select entity menu,
and an explicit Follow active entity toggle. Selecting an entity in the diagram
or menu centers it and exposes its value as text; this never changes the trace.

- Mouse: drag to pan; wheel over the SVG to zoom about the pointer. Wheel
  scrolling remains native at the zoom bounds and Ctrl/Meta+wheel is reserved
  for browser-level zoom.
- Touch: one-finger drag to pan, two-finger pinch to zoom, or use the toolbar.
- Keyboard: focus the diagram, use arrow keys to pan, + and - to zoom, and 0
  to fit. The native entity menu provides keyboard and screen-reader selection.
  Focus the overall Visualization player for playback shortcuts instead.

Follow-active starts off. When enabled, it centers the first currently visible
authored active entity without synthesizing activity. Manual pan, zoom, fit or
selection always disables following until explicitly re-enabled. Seeking
and autoplay do not erase manual camera choices. Replacing the trace with a
different object returns the camera to overview, clears selection and disables
following alongside the existing playback reset. Resizing the host can change
layout geometry, but cannot mutate frames. Hidden entities remain unselectable.

The viewport operates only on SVG viewBox presentation state, without a new
trace schema, group hierarchy or inferred events. Its physical SVG height
follows the stable trace-wide layout's aspect ratio so sparse scenes do not
reserve a tall blank viewport. Very dense scenes are capped at 960px; Fit
to view still preserves the complete graph's aspect ratio, and zoom, pan
and selection expose smaller mobile details. The height responds smoothly
to container changes except when reduced motion is requested. Navigation keeps the camera center within
the world bounds, which allows actual centering of edge nodes while retaining
some of the scene on screen.

## Hierarchical groups and drill-down (TL-I14)

Legacy `group "Name" as tree` and `node a "A" in "Name" = 0` remain
supported. For opt-in nested groups, give each participating group a stable ID,
refer to a parent by ID, and keep node membership in one immediate named lane:

~~~thl flow
group "Worker" id worker under system as row
group "System" id system as column
group "Outside" id outside as row
node job "Job" in "Worker" = "ready"
node external "API" in "Outside" = "waiting"
link request job -> external "request"
step "Send"
  send request = "hello"
~~~

The group toolbar can drill into a group, collapse it into a summary, expand it,
and return through the breadcrumb trail to overview. Collapsing never changes
authored `hide`/`show`, entity values, trace frames or event history.
The summary counts only authored-visible entities. Boundary links retain all
source relation IDs in accessible SVG tooltips and transfer annotations.
An active aggregate edge uses a **static highlight** for one or more actual
`send` events; it does not imply all constituent relations sent or that the
destination stored anything. A collapsed summary highlights authored focus
and changed state in that step, without exposing system-hidden entities. The state
inspector still shows real authored values.

Group IDs and parent IDs are an additive opt-in version-1 trace extension,
with no new package import path. Old `thl` sources need no migration. Older
Throughline compilers cannot parse `id`/`under` grammar, and older players
receiving a new compiled trace may display it as flat lanes without collapse.
Only author hierarchical source when its consumer uses a compatible compiler.
Static layout uses the existing deterministic engine and does not add an
external graph-layout dependency. On replacing the `trace` object, collapse
and breadcrumb choices reset alongside selection, camera and playback.

## Supported domains

| Domain | What it explains | Authoring model |
| --- | --- | --- |
| `flow` | State, relationships and changes | Explicit nodes, links and steps |
| `bindings` | Primitives, references, mutation and rebinding | Small assignment/push language |
| `binary` | Ripple-carry binary addition | Two unsigned binary operands |
| `matrix` | Matrix multiplication | Two small compatible matrices |
| `callstack` | Recursive factorial calls and returns | A bounded factorial input |

All five domains produce the same version-1 trace shape. Domains are
intentionally limited; Throughline is not a general-purpose JavaScript
interpreter or an automatic execution tracer.

## Validate Markdown with Remark

Import `remarkThroughline` from `@0xbuff/throughline/remark` and use it
in a Unified/Remark pipeline. The default `validate` mode checks each
`thl <domain>` fenced code node, fails the build with source-positioned
VFile diagnostics for invalid content, and leaves all Markdown nodes
unchanged. Ordinary fences are unaffected. No React dependency is required.

~~~ts
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkStringify from "remark-stringify";
import { remarkThroughline } from "@0xbuff/throughline/remark";

const processor = unified()
  .use(remarkParse)
  .use(remarkThroughline) // or .use(remarkThroughline, { mode: "validate" })
  .use(remarkStringify);

await processor.process({ path: "lesson.md", value: markdownSource });
~~~

The code fence header must contain exactly a supported domain, such as
\`\`\`thl flow\`\`\`; additional fence metadata is not supported. The host
parser supplies code-body lines and file positions. The validator locates
body tokens from the original Markdown, including list and blockquote prefixes.
When no trustworthy position exists, the error remains file-level rather
than pointing at an unrelated fence header. A Markdown document
may contain multiple traces, but publishers should also bound total document
size and number of fences. Validate mode never rewrites the AST, renders the
player or emits JSX. MDX mode is explicitly opt-in.

### Render Throughline fences from MDX

A host using the Unified-based MDX compiler can enable the transformation
and register the React bridge in its MDX component map:

~~~tsx
import { remarkThroughline } from "@0xbuff/throughline/remark";
import { ThroughlineEmbed } from "@0xbuff/throughline/react";
import "@0xbuff/throughline/styles/throughline.css";

// Pass to your MDX compiler's Remark plugin configuration:
const remarkPlugins = [[remarkThroughline, { mode: "mdx" }]];

// Pass to your MDX renderer's components map:
const mdxComponents = { ThroughlineEmbed };
~~~

The plugin validates each `thl <domain>` fence first, then replaces it with
an `mdxJsxFlowElement` whose `source` attribute is a **literal string**.
Quotes, braces, backticks and markup in a validated trace stay data: no
JavaScript expressions or untrusted HTML are generated by this transform.
All matching fences must validate before any are replaced. Other fences
and Markdown nodes are unchanged.

`componentName` can override the default `ThroughlineEmbed` with one
capitalized React identifier, such as `CustomTrace`; the host must register
that exact name. If registration is missing, MDX rendering fails rather than
silently displaying an empty visualization. Plain Markdown pipelines should
use `validate`, not `mdx`, unless their output compiler supports MDX JSX.

`ThroughlineEmbed` accepts `source` plus the existing player presentation
props (`title`, `theme`, `className`, `sonification`). It memoizes compilation
for unchanged source, but **still compiles at runtime** during SSR and in
clients; build-time validation does not serialize a precompiled trace. The
host owns MDX component registration, trusted-content policy and aggregate
document budgets. An MDX host can execute its *other* authored expressions;
this plugin does not make arbitrary MDX content safe to execute.

## Guided explanations and scenario comparison (TL-I15)

Guidance is **optional, host-authored presentation data**, not compiled trace
metadata. Chapters identify inclusive, zero-based frame ranges. Selecting a
chapter seeks to its first frame and pauses playback. The **Restart chapter**
button returns to the beginning of the current chapter (including while
playing). Causal explanations
show the author's **Trigger**, **Observed event**, **State change**,
**Consequence**, and references to real compiled events. Chronology alone
never establishes causation.

Three checkout outcomes are separately authored and independently compiled:

~~~tsx
import { compile } from "@0xbuff/throughline";
import { CHECKOUT_GUIDANCE, CHECKOUT_SCENARIOS } from "@0xbuff/throughline/examples";
import { ThroughlineScenarios } from "@0xbuff/throughline/react";
import "@0xbuff/throughline/styles/throughline.css";

const scenarios = CHECKOUT_SCENARIOS.map((item) => ({
  id: item.id,
  title: item.title,
  description: item.description,
  trace: compile(item.source),
  guidance: item.id === "retry-recovery" ? CHECKOUT_GUIDANCE : undefined,
}));

export function CheckoutComparison() {
  return <ThroughlineScenarios scenarios={scenarios} />;
}
~~~

Each scenario has a unique nonempty ID, title and compiled trace. The optional
`initialScenarioId` selects the starting outcome. Switching scenarios
remounts its player, resetting step, playback, speed, camera, selection and
sound voice, without changing any snapshot. Ordinary rerenders of the same
option preserve state. Replacing a trace object uses the existing reset.
If the host removes the selected scenario, selection moves to the first
available outcome and stays there even if the removed option returns later;
an empty list clears selection and a subsequently populated list selects its
first option. `initialScenarioId` is only used on initial mount.
An empty scenario list shows a text empty state. A single player or
`ThroughlineEmbed` can also accept the `guidance` prop.

`ThroughlineGuidance` accepts ordered, nonoverlapping `chapters` with
`{ id, title, start, end, summary? }`, and `causalLinks` with
`{ id, title, step, trigger, observedEvent, stateChange, consequence, evidence }`.
Each evidence item is `{ step, event }`: a zero-based frame index and an
event index within `trace.frames[step].events`. Evidence must not lie
after the link's display frame and must reference at least one actual
`set`, `show` or `hide` event. A `send` alone does not prove persistence.

Invalid range, duplicate ID, missing event or unsupported evidence fails
explicitly. Limits: 100 chapters, 200 links, 20 event references per link,
4096 characters per text field; IDs start with an ASCII letter and contain
up to 64 ASCII letters, digits, underscores or hyphens. Evidence proves
provenance, **not the truth of causal prose**: authors must review it against
notes and snapshots. All descriptions render as text, not HTML. No native
branching graph, simulation, network or hidden telemetry is introduced.

## Public package exports

| Import path | Contents |
| --- | --- |
| `@0xbuff/throughline` | Core compiler, parser, types, validation, tracer |
| `@0xbuff/throughline/remark` | Build-time `remarkThroughline` validation and optional MDX output (no React dependency) |
| `@0xbuff/throughline/react` | Optional `ThroughlinePlayer`, `ThroughlineEmbed`, `ThroughlineScenarios` and React types |
| `@0xbuff/throughline/examples` | Copyable authored fixtures |
| `@0xbuff/throughline/styles/throughline.css` | Opt-in, namespaced CSS |

Only these five entry points are supported; importing from package
`src/` or `dist/` paths is not part of the API. The compiler is
React-free, network-free and usable in offline tooling.

## How it works

1. **Parse:** `compile` reads one `thl <domain>` block, preserving useful
   source-line information for diagnostics.
2. **Build:** `flow` is parsed into an authored program; computed domains
   construct the same program model from bounded input parameters.
3. **Validate and compile:** the engine rejects invalid references, JSON
   values, conflicting writes and excessive work, then produces an initial
   frame plus a snapshot for each step.
4. **Present (optional):** the React player uses the compiled frames to
   render a responsive scene, controls, captions and an inspectable state.
   Seeking a frame does not execute the source a second time.

Trace schema version `1` is independent of the npm package version.
Source length is capped at 262,144 UTF-16 code units; the authored
program is limited to 200 entities, 1,000 relations, 2,000 steps and
10,000 events, plus work/expansion budgets. These limits are for
deterministic work, not a guarantee of exact heap or CPU usage.

For the complete guide, see the [Throughline documentation](https://docs.0xbuff.com/docs/throughline) and the [architecture notes](https://github.com/0xbuffdev/throughline/blob/main/docs/architecture.md).

## Documentation

- [Throughline documentation](https://docs.0xbuff.com/docs/throughline)
- [Grammar and authored flow](https://github.com/0xbuffdev/throughline/blob/main/docs/grammar.md)
- [Domain catalog and domain-specific limits](https://github.com/0xbuffdev/throughline/blob/main/docs/catalog.md)
- [Architecture, trace format and runtime boundaries](https://github.com/0xbuffdev/throughline/blob/main/docs/architecture.md)
- [Complex reference traces, questions and compatibility boundaries](https://github.com/0xbuffdev/throughline/blob/main/docs/reference-traces.md)
- [Adding a computed domain](https://github.com/0xbuffdev/throughline/blob/main/docs/authoring.md)
- [Changelog](https://github.com/0xbuffdev/throughline/blob/main/CHANGELOG.md)

## Development

The source is a standalone Node 24 / pnpm 11.2.2 package, not a
multi-package workspace.

~~~sh
pnpm install --frozen-lockfile
pnpm audit:source
pnpm typecheck
pnpm test:run
pnpm exec playwright install chromium
pnpm test:browser:run
pnpm build
pnpm audit:licenses
pnpm audit:pack
pnpm audit:browser
~~~

The packed-consumer audits install the built archive into independent
Node, TypeScript, React SSR and Vite/browser environments.

## Community

Read [contributing guidelines](https://github.com/0xbuffdev/throughline/blob/main/CONTRIBUTING.md) before opening a PR.
Use [GitHub issues](https://github.com/0xbuffdev/throughline/issues)
for reproducible bugs and feature proposals; see
[SUPPORT.md](https://github.com/0xbuffdev/throughline/blob/main/SUPPORT.md) for support and [SECURITY.md](https://github.com/0xbuffdev/throughline/blob/main/SECURITY.md)
for confidential vulnerability reports. Participation is governed by
the [code of conduct](https://github.com/0xbuffdev/throughline/blob/main/CODE_OF_CONDUCT.md).

## License

Licensed under [Apache-2.0](https://github.com/0xbuffdev/throughline/blob/main/LICENSE).
Copyright 2026 0xBUFF; see [COPYRIGHT.md](https://github.com/0xbuffdev/throughline/blob/main/COPYRIGHT.md).
The license covers software rights under its terms, not trademark use.
