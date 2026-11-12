# Throughline

[![CI](https://github.com/0xbuffdev/throughline/actions/workflows/ci.yml/badge.svg)](https://github.com/0xbuffdev/throughline/actions/workflows/ci.yml) [![npm version](https://img.shields.io/npm/v/%400xbuff%2Fthroughline)](https://www.npmjs.com/package/@0xbuff/throughline) [![License: Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-blue)](LICENSE) [![Node.js](https://img.shields.io/badge/node-%3E%3D24-blue)](package.json)

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

The React player and stylesheet are optional. Read the [player and Markdown
guide](docs/user-guide.md) for theming, accessible controls, narration,
hierarchy, scenarios and MDX integration.

## Preview locally

The [Vite playground](playground/) renders the current checkout's source, not
necessarily the version currently available from npm. With Node.js 24+ and
pnpm 11.2.2:

~~~sh
pnpm install --frozen-lockfile
pnpm dev
~~~

Open [http://localhost:5173](http://localhost:5173) to step through examples,
compare scenarios and inspect responsive layouts. The playground is excluded
from the published npm package.

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

 see the [Throughline documentation](https://docs.0xbuff.com/docs/throughline) and the [architecture notes](https://github.com/0xbuffdev/throughline/blob/main/docs/architecture.md).

## Documentation

- [User guide: player, themes, audio, navigation and Markdown](docs/user-guide.md)
- [Grammar reference](docs/grammar.md) and [supported domains](docs/catalog.md)
- [Framework integration guide](docs/framework-integrations.md)
- [Architecture and trace model](docs/architecture.md)
- [Complete documentation index](docs/README.md)
- [Changelog](CHANGELOG.md), [v0.1.0 release notes](docs/release-notes-v0.1.0.md)
  and [upgrade guide](docs/migration-v0.1.0.md)

## Development

To build and verify a checkout, use the [development and verification commands](docs/releasing.md#verification).

## Community

Read [contributing guidelines](https://github.com/0xbuffdev/throughline/blob/main/CONTRIBUTING.md) before opening a PR.
Use [GitHub issues](https://github.com/0xbuffdev/throughline/issues)
for reproducible bugs and feature proposals; see
[support guidance](CONTRIBUTING.md#support) for support and [SECURITY.md](https://github.com/0xbuffdev/throughline/blob/main/SECURITY.md)
for confidential vulnerability reports. Participation is governed by
the [code of conduct](https://github.com/0xbuffdev/throughline/blob/main/CODE_OF_CONDUCT.md).

## License

Licensed under [Apache-2.0](https://github.com/0xbuffdev/throughline/blob/main/LICENSE).
Copyright 2026 0xBUFF; see [COPYRIGHT.md](https://github.com/0xbuffdev/throughline/blob/main/COPYRIGHT.md).
The license covers software rights under its terms, not trademark use.
