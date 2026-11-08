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

> **Release status:** Package version `0.0.1` is configured for public npm
> distribution but has **not been published yet**. The existing source
> repository is private pending a separately reviewed, clean public-source
> cutover. See [release status](RELEASING.md).

## Features

- **Author in Markdown:** write a `thl` code fence with explicit, named steps.
- **Deterministic snapshots:** compile once, then seek through immutable
  frames without re-running the authored program.
- **Five supported domains:** hand-authored `flow`, reference `bindings`,
  `binary` addition, `matrix` multiplication and recursive `callstack`.
- **React is optional:** use the pure compiler from Node or other ESM
  environments without loading React or browser globals.
- **Accessible playback:** keyboard navigation, step captions, a state
  inspector, reduced-motion support and explicit CSS/theme controls.
- **Bounded by design:** source, state, event and expansion limits provide
  predictable rejection rather than uncontrolled trace growth.

## Installation

Once the first release is published to npm:

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
  return <ThroughlinePlayer trace={trace} theme="auto" />;
}
~~~

Import the stylesheet once in the host application. The player accepts
`light`, `dark` or `auto` themes and supports `--thl-*` CSS variables.
Pass a stable trace reference while stepping; replacing it resets playback.
Audio controls are absent unless you explicitly supply `sonification`.

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

## Public package exports

| Import path | Contents |
| --- | --- |
| `@0xbuff/throughline` | Core compiler, parser, types, validation, tracer |
| `@0xbuff/throughline/react` | Optional `ThroughlinePlayer` and React types |
| `@0xbuff/throughline/examples` | Copyable authored fixtures |
| `@0xbuff/throughline/styles/throughline.css` | Opt-in, namespaced CSS |

Only these four entry points are supported; importing from package
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

Trace schema version `1` is separate from package version `0.0.1`.
Source length is capped at 262,144 UTF-16 code units; the authored
program is limited to 200 entities, 1,000 relations, 2,000 steps and
10,000 events, plus work/expansion budgets. These limits are for
deterministic work, not a guarantee of exact heap or CPU usage.

For technical details, see the [architecture notes](docs/architecture.md).

## Documentation

- [Grammar and authored flow](docs/grammar.md)
- [Domain catalog and domain-specific limits](docs/catalog.md)
- [Architecture, trace format and runtime boundaries](docs/architecture.md)
- [Adding a computed domain](docs/authoring.md)
- [Changelog](CHANGELOG.md)

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
Node, TypeScript, React SSR and Vite/browser environments. Build success
does not, by itself, authorize a public release.

## Community

Read [contributing guidelines](CONTRIBUTING.md) before opening a PR.
Use [GitHub issues](https://github.com/0xbuffdev/throughline/issues)
for reproducible bugs and feature proposals; see
[SUPPORT.md](SUPPORT.md) for support and [SECURITY.md](SECURITY.md)
for confidential vulnerability reports. Participation is governed by
the [code of conduct](CODE_OF_CONDUCT.md).

## License

Licensed under [Apache-2.0](LICENSE).
Copyright 2026 0xBUFF; see [COPYRIGHT.md](COPYRIGHT.md).
The license covers software rights under its terms, not trademark use.
