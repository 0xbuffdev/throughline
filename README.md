# Throughline

[![CI](https://github.com/0xbuffdev/throughline/actions/workflows/ci.yml/badge.svg)](https://github.com/0xbuffdev/throughline/actions/workflows/ci.yml) [![Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-blue)](LICENSE)

**Explain how state changes, one step at a time.**

Throughline is a TypeScript library for turning authored state changes into an inspectable timeline. Define what exists, what is known, and which events occurred. Throughline validates those facts, compiles reproducible snapshots, and can display them with an optional React player.

It works for algorithms, recursion, data structures, message exchanges, and other processes that benefit from seeing *what changed* and *why the source says it changed*. The core runs offline, without executing the described program or calling an AI service.

> **Release status:** This branch documents the **v0.2.0 source release candidate**, not an npm release. The schema-2 API below is intentionally incompatible with v0.1.x. Check `npm view @0xbuff/throughline version` before installing; do not assume the registry has v0.2.0. Publication is gated on human accessibility testing and the release checks described in [Releasing](docs/releasing.md).

## What you can do

- **Author one model, use several views.** A schema-2 `VisualArtifact` declares entities, relations, initial values, and explicit events. The same compiled trace powers a graph, message sequence, or state table.
- **Inspect evidence, not guesses.** See before/after values, history, source event IDs, declarations of uncertainty, and cited explanations. A sent message does not automatically become a received message or a persistent write.
- **Write Markdown or work in TypeScript.** An unqualified `thl` code fence accepts strict schema-2 JSON. Descriptive prose requires a separately reviewed, hash-bound artifact; Throughline does not silently generate a model from it.
- **Render only when needed.** The compiler, validator, and inspector do not need React. The optional React 19 player provides playback, keyboard interaction, source inspection, and opt-in browser narration.
- **Check content offline.** The `thl` CLI validates artifacts and Markdown/MDX files, with a human-review gate for materialized prose.

## Installation

Once **v0.2.0 has actually been published**, use Node.js 24+ and an ESM project:

~~~sh
npm view @0xbuff/throughline version
npm install @0xbuff/throughline@0.2.0
~~~

The core has no React peer requirement at runtime. For the optional player, install compatible React 19 and React DOM 19:

~~~sh
npm install react@^19 react-dom@^19
~~~

For the unreleased candidate, work from a checked-out source revision with Node.js 24+ and the repository's pinned pnpm 11.2.2; do not substitute the currently published npm version for these examples.

## Quick start: compile and inspect a trace

An artifact models facts rather than executable code. Here is a counter with one explicit write:

~~~ts
import { compileArtifact, inspectTrace } from "@0xbuff/throughline";
import type { VisualArtifact } from "@0xbuff/throughline";

const artifact: VisualArtifact = {
  schemaVersion: 2,
  id: "counter-demo",
  origins: [{ id: "author", kind: "authored" }],
  entities: [{ id: "counter", label: "Counter" }],
  relations: [],
  initialState: {
    counter: { status: "known", value: 0 },
  },
  steps: [{
    id: "increment",
    label: "Increase counter",
    events: [{
      id: "write-counter",
      originId: "author",
      type: "write",
      entityId: "counter",
      path: [],
      value: { status: "known", value: 1 },
    }],
  }],
};

const trace = compileArtifact(artifact);
const inspector = inspectTrace(trace);

console.log(trace.frames.map(frame => frame.id));
// ["@initial", "increment"]
console.log(inspector.valueAt(0, "counter")); // known 0
console.log(inspector.valueAt(1, "counter")); // known 1
console.log(inspector.history("counter"));   // includes "write-counter"
~~~

There are two immutable snapshots: the initial state and the result of the complete `increment` step. The event is not inferred from a label or animation; it is present because the source declares it.

### Render the optional React player

~~~tsx
import { compileArtifact } from "@0xbuff/throughline";
import { EXAMPLES } from "@0xbuff/throughline/examples";
import { ThroughlineGraphPlayer } from "@0xbuff/throughline/react";
import "@0xbuff/throughline/styles/throughline.css";

const reference = EXAMPLES[0];
const trace = compileArtifact(reference.artifact);

export function Demo() {
  return <ThroughlineGraphPlayer trace={trace} title={reference.title} theme="auto" />;
}
~~~

The player supports Graph, Sequence, and State table views, plus an Explain/Inspect panel. Sequence only shows explicitly modeled message phases; otherwise Throughline uses an honest state-table fallback. The bundled references cover factorial recursion, 2×2 matrix multiplication, binary addition, and a *hypothetical* distributed checkout. [Explore the references](docs/catalog.md).

## Author in Markdown

Use a plain `thl` fence, without domain qualifiers:

~~~~markdown
~~~thl
{
  "schemaVersion": 2,
  "id": "counter",
  "origins": [{ "id": "author", "kind": "authored" }],
  "entities": [{ "id": "counter", "label": "Counter" }],
  "relations": [],
  "initialState": { "counter": { "status": "known", "value": 0 } },
  "steps": [{
    "id": "increment", "label": "Increment",
    "events": [{
      "id": "write", "originId": "author", "type": "write",
      "entityId": "counter", "path": [],
      "value": { "status": "known", "value": 1 }
    }]
  }]
}
~~~
~~~~

For direct JSON, the Remark integration validates and compiles offline. If a `thl` fence contains prose instead, the host must load a **reviewed** schema-2 sidecar with matching source and artifact SHA-256 digests. Unreviewed or stale materialization fails the build; prose is never executed.

Read the [authoring guide](docs/grammar.md), [CLI review workflow](docs/cli.md), and [Markdown/MDX integration guide](docs/framework-integrations.md) for exact formats and setup.

## How it works

1. **Validate:** Check schema version, IDs, relationships, state types, event references, and resource limits. Strict JSON rejects duplicate object keys.
2. **Compile:** Apply each step atomically, producing deterministic snapshots. Writes and topology changes are explicit; observations and message phases do not mutate state by themselves.
3. **Inspect:** Query known, unknown, or absent values, history, differences, event origins, and declared dependencies.
4. **Project:** Derive graph, sequence, and state-table descriptions from the *same* compiled trace without fabricating events.
5. **Present:** Render the descriptions with the optional React player or use the pure APIs in another UI.

The artifact records **authored evidence**, not proof that a real system performed those actions. Even a `reviewed` claim means an editor reviewed it, not that Throughline independently established its truth. See [Architecture](docs/architecture.md) and [Schema 2](docs/schema-v2.md).

## Public interfaces

| Entry point | What it provides |
| --- | --- |
| `@0xbuff/throughline` | Pure validation, compilation, inspection, projections, serialization and authoring helpers |
| `@0xbuff/throughline/examples` | Four reference artifacts and accompanying explanations and questions |
| `@0xbuff/throughline/react` | `ThroughlineGraphPlayer` and `ThroughlineEmbed` |
| `@0xbuff/throughline/remark` | Markdown/MDX `thl` validation and inert literal-data transform |
| `@0xbuff/throughline/node` | Trusted, root-confined filesystem host for content builds |
| `@0xbuff/throughline/styles/throughline.css` | Opt-in namespaced player styles |
| `thl` command | Validate JSON, materialize *unreviewed* sidecars, and check Markdown/MDX |

The npm package version (`0.2.0`) and artifact `schemaVersion` (`2`) are separate. There is no schema-1 compatibility adapter. See [Migrating from v0.1.x](docs/migration-v0.2.0.md).

## Develop and contribute

~~~sh
corepack enable
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test:run
pnpm build
pnpm dev
~~~

`pnpm dev` launches the repository's **development reference preview**, currently intended for inspecting examples rather than as a finished authoring product. It is not part of the npm tarball, and this PR does not deploy a hosted playground.

For browser, package, security, framework, and release checks, use [Contributing](CONTRIBUTING.md). For changes and upgrade guidance, see the [Changelog](CHANGELOG.md), [Documentation index](docs/README.md), and [v0.2.0 candidate notes](docs/release-notes-v0.2.0.md).

## Project

Licensed under [Apache-2.0](LICENSE), copyright 2026 0xBUFF. See [Contributing](CONTRIBUTING.md) for bugs and feature requests, [Security](SECURITY.md) for private vulnerability reports, and the [Code of Conduct](CODE_OF_CONDUCT.md) for community expectations.
