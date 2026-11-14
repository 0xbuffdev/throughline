# Throughline user guide

This guide expands the [README](../README.md) quick start with details about
the optional React player, authored state, narration, groups, scenarios and
Markdown integration. The core compiler can also be used without React.

## React player appearance and theming

Import the optional stylesheet once in the host application. The player
accepts an optional `title` (omitted when absent), and `light`, `dark` or
`auto` themes. **Player options** in the header groups chapter
selection, step jumps, diagram navigation, and display and audio settings.
Below the diagram, Previous, Play/Pause and Next sit alongside the step count
and speed selector. The caption and its optional inspector follow playback.

The shell, group boxes, nodes, cells and form inputs use a compact default
`--thl-radius: 0.125rem` (2px at a 16px root font size), with 0.5rem inner
spacing and 1.5rem player padding. Node strokes default to
`--thl-node-border-width: 1.25px`. Icon-only buttons have no visible boxes,
with visible keyboard focus and 2.5rem interactive targets on narrow embeds.
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
`--thl-muted`, `--thl-line`, `--thl-focus`, `--thl-change`, `--thl-change-bg`,
`--thl-active`, `--thl-trail`, `--thl-trail-bg` and control tokens belong to the player, not the host's `:root` or `.dark`.

The shell and its text are neutral; only state-carrying marks take a hue.
`--thl-active` colors what happens in the current step (the sending arrow,
its label and the Play button), `--thl-trail` is the same hue family washed
out for history, and `--thl-change` is the only warm color, reserved for
changed values. Dashed outlines mean structure (collapsed, revealed or
aggregate), never selection: a selected node and the keyboard-focused node
are marked by an outer ring.

Motion timing follows the step interval. The player sets `--thl-step-ms` on
its root (1500ms at 1x, 750ms at 2x) and the draw and flash durations derive
from it. A host can override `--thl-draw-ms` and `--thl-flash-ms` on `.thl`
like any other token.

**Maximize player** in Player options enters native browser fullscreen
and changes to **Minimize player** while active, including when fullscreen
changes via Esc. It is disabled where the API is unavailable or blocked.
Sound controls appear only when the host supplies `sonification`. The
inspector remains optional, the trace reference should remain stable while
stepping, and complete custom stylesheets must retain accessibility.

### Playback accessibility

Focus the **Visualization player** to use Left/Right arrows for stepping,
Home/End to jump to the first/last step, and Space to play or pause. Native
buttons, the step-number input and the playback-speed selector keep
their own keyboard interactions; shortcuts do not steal keystrokes from
focused controls. Each frame has an accessible text summary. **Inspect
state** is a native disclosure exposing complete visible values.

Playback starts paused at the first frame. Changing to a different trace
object resets the step, playback and speed; passing a stable trace object
during ordinary renders avoids unnecessary resets. To skip to a frame, open
**Player options**, enter the number shown in the counter and choose
**Go to step**. Frame numbers start at 1, which includes the initial state.
A direct jump pauses playback and displays the target frame. Motion is declared only under
`prefers-reduced-motion: no-preference` and plays only when a step is reached
by one forward step (play, or Step forward): the sending arrow draws, its
arrowhead lands, then a changed value flashes. Jumping to a step,
rewinding or replacing the trace shows the settled frame immediately.

Sound is off by default, and the host must provide a `sonification` option
before the user can enable it. A host can explicitly start enabled using
`sonification={{ enabled: true }}`. A new trace object restarts its initial
sound cue and stops the previous one, even when both traces have the same
number of frames; rerendering with the same trace does not replay audio.
A refused fullscreen request is
announced to assistive technology; playback remains available in-page.
Browser support and host policies determine whether fullscreen can start.
In fullscreen the header stays at the top, the diagram is centered in the
available space, and playback controls sit at the bottom above the caption.
Expanding Details moves the controls up and gives the diagram a smaller area.

## Trace reader compatibility

`ThroughlinePlayer` expects a compiler-produced version-1 `Trace` and rejects
unsupported versions or a missing `frames` array at runtime. This is **not**
a complete validator for arbitrary serialized snapshots. Treat external JSON
as untrusted and validate it at the host boundary; prefer compiling bounded
source with `compile`.

For the reader's trust boundary, see [architecture](architecture.md).

## Responsive controls and step detail

Fit and zoom sit beside the diagram on wide embeds and above it in a
short row on narrow embeds. The controls adapt to the player's own width,
including inside a narrow article column on a wide screen. The step count
uses a compact form on phones and retains its full screen-reader text.

The authored caption follows the transport as a native **Details**
disclosure. Its closed header shows the step title and a single-line
preview of the note. Open Details to read the
complete note, transfers, optional causal evidence, and the state
inspector. The detailed content has its own bounded scroll area so
long author-provided explanations cannot push the controls away
from the diagram. The screen-reader step announcement remains active
regardless of whether the disclosure is expanded. Details remain open
between steps until closed, without changing playback state.

## Opt-in caption narration

The optional React-only `narration` prop exposes a **Narrate captions**
button next to the independent `sonification` sound-effects toggle.
The button is **off initially**, even when a host offers it. Its first
activation speaks the current authored step from a user gesture using
the browser's Speech Synthesis API. It reads the authored step label,
notes, matching chapter and causal explanation, and transfer summaries.
It does not invent responses, state changes or causal explanations.
Very long utterances are shortened with an explicit spoken notice; the
full authored text remains available in Details.

With narration enabled, **Play advances only after speech finishes**.
Pause pauses the current voice; Play resumes it. Manual seeking or
stepping cancels the previous voice and narrates the selected step.
Switching scenarios cancels the old voice and starts muted. Disabling
narration returns to timed playback and leaves step tones independent.
Playback speed applies to the next utterance, not the current one.
A manual seek to the **same** step (including Restart chapter) restarts its
narration. If an author updates guidance while the current frame is shown,
the old utterance is invalidated and the corrected explanation is spoken.

Speech voices, available hardware, and user-activation policies depend
on the browser and OS. The button is disabled where speech synthesis is
unavailable; speech errors pause synchronized playback and are announced.
No text is uploaded by Throughline, but the browser may use a network
speech service. The core stays React- and browser-independent.

**Multiple embedded players:** Browser speech synthesis has one global queue.
Throughline coordinates narration across its player instances: when B begins
speaking, B takes over and A is paused, unmutes no further audio, and reports
that another player is speaking. A's later seek/unmount does not interrupt B.
A may explicitly re-enable narration to take over again. External scripts
calling the browser speech API are not under Throughline's control; an
unexpected `interrupted` or `canceled` utterance is treated as an error:
narration-driven playback pauses and shows a recoverable message. This
behavior does not imply exclusive ownership of third-party speech.

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
a fully highlighted arrow without drawing animation or value flashes. Screen readers
get an authored-progress count with the current step.

## Guided viewport navigation

The React player opens with a fit-to-view overview. Use **Zoom in**,
**Zoom out** (1× to 4×), and **Fit to view** beside or above the diagram.
Under **Player options → Diagram**, use **Select entity** or toggle
**Follow active entity**. Selecting an entity in the diagram or menu centers
it and shows its value as text. These actions affect the view only.

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
trace schema, group hierarchy or inferred events. In an embedded player, the
SVG height follows the stable trace-wide layout's aspect ratio so sparse scenes do not
reserve a tall blank viewport. Very dense scenes are capped at 960px; Fit
to view still preserves the complete graph's aspect ratio, and zoom, pan
and selection expose smaller mobile details. The height responds smoothly
to container changes except when reduced motion is requested. Navigation keeps the camera center within
the world bounds, which allows actual centering of edge nodes while retaining
some of the scene on screen.

## Hierarchical groups and drill-down

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

The group controls under **Player options → Diagram** let you drill into a
group, collapse it into a summary, expand it, and return to the overview
through the breadcrumb trail. Collapsing never changes
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

## Guided explanations and scenario comparison

Guidance is **optional, host-authored presentation data**, not compiled trace
metadata. Chapters identify inclusive, zero-based frame ranges. Under
**Player options → Navigation**, selecting a chapter seeks to its first frame
and pauses playback. **Restart chapter** returns to the beginning of the
current chapter and pauses playback. Causal explanations show the author's **Trigger**, **Observed event**, **State change**,
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

For compiler and schema details, see [architecture](architecture.md).
