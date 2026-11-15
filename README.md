# Throughline

[![CI](https://github.com/0xbuffdev/throughline/actions/workflows/ci.yml/badge.svg)](https://github.com/0xbuffdev/throughline/actions/workflows/ci.yml) [![npm version](https://img.shields.io/npm/v/%400xbuff%2Fthroughline)](https://www.npmjs.com/package/@0xbuff/throughline) [![License: Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-blue)](LICENSE) [![Node.js](https://img.shields.io/badge/node-%3E%3D24-blue)](package.json)

**Readable state over time, authored in Markdown.**

Throughline compiles small, explanatory state traces into deterministic,
versioned snapshots. Its optional React player makes each change visible as
a step-by-step SVG scene—with keyboard controls, accessible descriptions,
responsive controls and opt-in sound. Previous, play/pause and next are
always in reach. Player options can jump directly to a numbered step.

Use it to explain what changes during an algorithm, a data-structure
operation, a recursive call or a system workflow. Throughline does not
execute arbitrary code or require an account, server, network connection
or application-specific runtime.

## Schema-2 engine and universal authoring (unreleased source)

The accepted architecture replaces domain-tagged fences with one `thl` authoring
surface and a schema-2 evidence-aware artifact. **TL-U02 added strict
validation; TL-U03 added deterministic atomic replay; TL-U04 added indexed
`inspectTrace` queries; TL-U05 added source-linked graph projection
and native `ThroughlineGraphPlayer`; TL-U06 adds the evidence-aware message
sequence projection and accessible timeline; TL-U07 adds the pure
`projectInspection` query and native Explain/Inspect interface; **TL-U08
introduces one strict schema-2 `thl` fence with reviewed prose materialization.**

**The new Remark/MDX `thl` route is schema 2 only**, with native
`ThroughlineEmbed` using `artifactJson`. No domain-tagged fence or v1 source
bridge is accepted by that route. Internal schema-1 code remains as temporary
source scaffolding pending independent U09/U10 migration—not as a maintained
compatibility contract. Pure consumers use `compileArtifact` and the dedicated
`ThroughlineGraphPlayer`. Sequence, graph and Inspect share the same playback
frame and source selection. The release requires the remaining acceptance gates.

See [schema-2 validation, replay, graph and sequence views](docs/schema-v2.md)
for the implemented v2 boundary and precise source/evidence semantics.

### One domain-independent thl fence (TL-U08)

The first non-whitespace character distinguishes validated JSON (`{`) from
inert prose. For direct offline playback, author a schema-2 VisualArtifact:

~~~thl
{
  "schemaVersion": 2,
  "id": "counter",
  "origins": [{ "id": "author", "kind": "authored" }],
  "entities": [{ "id": "counter", "label": "Counter" }],
  "relations": [],
  "initialState": { "counter": { "status": "known", "value": 0 } },
  "steps": [{
    "id": "advance", "label": "Advance",
    "events": [{
      "id": "write", "originId": "author", "type": "write",
      "entityId": "counter", "path": [],
      "value": { "status": "known", "value": 1 }
    }]
  }]
}
~~~

Use `parseThlBody` for the pure disjoint parser or `resolveThlBody`
to obtain a compiled-valid artifact. The Markdown/MDX plugin validates JSON
without any manifest and sends only literal artifact JSON to the registered
React v2 component. A descriptive prose block instead **requires** a
reviewed, hash-bound sidecar supplied by a trusted host; unresolved prose is a
build error, not an AI call or a placeholder. Source hash = SHA-256 of
normalized-LF mdast body. Artifact hash = SHA-256 of canonical validated
JSON. No backward-compatibility parser is added. See
[framework and Markdown integrations](docs/framework-integrations.md).

### Native v2 graph player

~~~tsx
import { compileArtifact } from "@0xbuff/throughline";
import { ThroughlineGraphPlayer } from "@0xbuff/throughline/react";
import "@0xbuff/throughline/styles/throughline.css";

const artifact = {
  schemaVersion: 2 as const,
  id: "example",
  origins: [{ id: "author", kind: "authored" as const }],
  entities: [{ id: "left", label: "Left" }, { id: "right", label: "Right" }],
  relations: [{ id: "link", from: "left", to: "right" }],
  initialState: {
    left: { status: "known" as const, value: 0 },
    right: { status: "unknown" as const },
  },
  steps: [{
    id: "sent", label: "Request sent",
    events: [{
      id: "send", type: "message" as const, originId: "author",
      relationId: "link", messageId: "request", phase: "sent" as const,
    }],
  }],
};
const trace = compileArtifact(artifact);
export function Example() {
  return <ThroughlineGraphPlayer trace={trace} initialView="graph" title="Explicit message evidence" />;
}
~~~

The graph renders the `sent` connector only at the authored step. It does not
invent a receive, acknowledgement, processing event or destination write.

### Native v2 message sequence

The native v2 player defaults to the highest-priority compatible validated
artifact view hint, or automatically selects Sequence when modeled message
events exist. It also supports a manual **Sequence** option under Player options.
A caller can explicitly override the initial view:

~~~tsx
// `trace` is a compiler-owned CompiledTrace (schema 2).
<ThroughlineGraphPlayer trace={trace} initialView="sequence" />
~~~

The sequence view correlates **only** explicit `sent`, `received`,
`acknowledged`, and `processed` event evidence by validated message ID.
A missing acknowledgement is reported as **not modeled**, not proven lost.
Retries require explicit source events (with distinct event IDs); an explicit
timeout remains a state write or observation, never a fifth message phase.
The four-phase summary and accessible chronological text table expose the
declared origin, relation and event IDs without inventing network results.
Within one atomic step, event-array order is for display only: a received
phase placed before a modeled sent in the **same step** is not a missing-send
gap. The correlation display uses fixed 120-card pages even for thousands
of distinct IDs; the full source-linked summaries remain accessible through
earlier/newer page controls.
Switching to Graph or State table retains the current frame and selected
semantic entity. The pure `projectView` auto-choice is stable across frames
and prioritizes implemented compatible author hints.

### Native v2 Explain / Inspect

The schema-2 React player now has a visible **Explain / Inspect** switch.
Explain presents Graph, Sequence or State table; Inspect reads the same
selected frame and semantic entity through a pure query:

~~~ts
import { compileArtifact, inspectTrace, projectInspection } from "@0xbuff/throughline";
const inspector = inspectTrace(compileArtifact(artifact));
const investigation = projectInspection(inspector, {
  frameIndex: 1, compareFromIndex: 0, entityId: "left", path: [],
});
// investigation.changes lists only explicit writes/topology events.
// investigation.selected includes typed previous/current values and history.
// inspection of a selected event exposes only declared causal dependencies.
~~~

The UI answers **what changed?**, **what do we know?**, **where did this
message go?**, and **what evidence supports this?** through accessible text
tables, a safe typed path query and source-event navigation. The inspection
projection distinguishes known JSON null, unknown values, absent nested
paths, same-value writes and changes of modeled presence. An observation or
message phase never silently becomes a write; missing dependencies remain
explicitly unmodeled. Causal claims are editorial, not independently proven,
and future cited events cannot support claims in earlier frames.

**Source evidence is inspectable:** recorded observation cells (such as
"no acknowledgement recorded yet") and optional authored message payloads
appear in focused event details, clearly labeled as **not committed state**.
Before/after, history and snapshot values retain short previews while
keyboard-accessible exact JSON disclosures reveal *all* content in bounded
1,024-code-unit segments. Focused editorial claims display 12 per page;
each has its own independent 12-citation page. Even a valid artifact with
1,000 claims × 100 referenced events mounts a bounded set of controls.
Dependencies, changes and current-step event lists have separate bounds.
Neither hiding DOM entries nor disclosing editorial citations changes
the trusted source values or makes a causal inference.

No server, untrusted code evaluation, AI inference or v1 schema adapter is
part of Inspect. Its exact model and provenance rules are documented in
[the v2 semantics and Inspect guide](docs/schema-v2.md).

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
guide](https://github.com/0xbuffdev/throughline/blob/main/docs/user-guide.md) for theming, accessible controls, narration,
hierarchy, scenarios and MDX integration.

## Preview locally

The [Vite playground](https://github.com/0xbuffdev/throughline/tree/main/playground) renders the current checkout's source, not
necessarily the version currently available from npm. With Node.js 24+ and
pnpm 11.2.2:

~~~sh
pnpm install --frozen-lockfile
pnpm dev
~~~

Open [http://localhost:5173](http://localhost:5173) to step through examples,
compare scenarios and inspect the player at desktop, tablet, and phone widths.
The playground is excluded from the published npm package.

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

## Documentation

- [Documentation website](https://docs.0xbuff.com/docs/throughline)
- [User guide: player, themes, audio, navigation and Markdown](https://github.com/0xbuffdev/throughline/blob/main/docs/user-guide.md)
- [Grammar reference](https://github.com/0xbuffdev/throughline/blob/main/docs/grammar.md) and [supported domains](https://github.com/0xbuffdev/throughline/blob/main/docs/catalog.md)
- [Framework integration guide](https://github.com/0xbuffdev/throughline/blob/main/docs/framework-integrations.md)
- [Architecture and trace model](https://github.com/0xbuffdev/throughline/blob/main/docs/architecture.md)
- [Complete documentation index](https://github.com/0xbuffdev/throughline/blob/main/docs/README.md)
- [Changelog](https://github.com/0xbuffdev/throughline/blob/main/CHANGELOG.md), [v0.1.0 release notes](https://github.com/0xbuffdev/throughline/blob/main/docs/release-notes-v0.1.0.md)
  and [upgrade guide](https://github.com/0xbuffdev/throughline/blob/main/docs/migration-v0.1.0.md)

## Development

To build and verify a checkout, use the [development and verification commands](https://github.com/0xbuffdev/throughline/blob/main/docs/releasing.md#verification).

## Community

Read [contributing guidelines](https://github.com/0xbuffdev/throughline/blob/main/CONTRIBUTING.md) before opening a PR.
Use [GitHub issues](https://github.com/0xbuffdev/throughline/issues)
for reproducible bugs and feature proposals; see
[support guidance](https://github.com/0xbuffdev/throughline/blob/main/CONTRIBUTING.md#support) for support and [SECURITY.md](https://github.com/0xbuffdev/throughline/blob/main/SECURITY.md)
for confidential vulnerability reports. Participation is governed by
the [code of conduct](https://github.com/0xbuffdev/throughline/blob/main/CODE_OF_CONDUCT.md).

## License

Licensed under [Apache-2.0](https://github.com/0xbuffdev/throughline/blob/main/LICENSE).
Copyright 2026 0xBUFF; see [COPYRIGHT.md](https://github.com/0xbuffdev/throughline/blob/main/COPYRIGHT.md).
The license covers software rights under its terms, not trademark use.
