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
- **Remark validation is optional:** validate multiple `thl` fences with a standalone `./remark` plugin; Markdown remains unchanged.
- **React is optional:** use the pure compiler from Node or other ESM
  environments without loading React or browser globals.
- **Accessible playback:** keyboard navigation, step captions, a state
  inspector, reduced-motion support and explicit CSS/theme controls.
- **Bounded by design:** source, state, event and expansion limits provide
  predictable rejection rather than uncontrolled trace growth.
- **Complex reference traces:** inspect keyed React reconciliation and a
  distributed checkout with a lost acknowledgement, retry and recovery.

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
time. The optional state inspector remains in the caption.

The shell's default `--thl-radius` is `0.325rem` and node outline width is
`--thl-node-border-width: 0.125rem`. Host overrides are scoped to the
player; for example, with `className="my-trace"` and a stylesheet loaded
after the package CSS:

~~~css
.thl.my-trace {
  --thl-radius: 0.5rem;
  --thl-bg: light-dark(oklch(0.98 0 0), oklch(0.14 0 0));
}
~~~

The `--thl-bg`, `--thl-panel`, `--thl-surface`, `--thl-text`,
`--thl-muted`, `--thl-line`, `--thl-focus`, `--thl-change` and
control tokens belong to the player, not the host's `:root` or `.dark`.

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
parser supplies code-body lines and file positions. A Markdown document
may contain multiple traces, but publishers should also bound total document
size and number of fences. The validator never renders the player or emits
JSX. The opt-in MDX transformation and React bridge are separate future work.

## Public package exports

| Import path | Contents |
| --- | --- |
| `@0xbuff/throughline` | Core compiler, parser, types, validation, tracer |
| `@0xbuff/throughline/remark` | Build-time `remarkThroughline` validator (no React dependency) |
| `@0xbuff/throughline/react` | Optional `ThroughlinePlayer` and React types |
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
