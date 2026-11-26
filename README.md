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
surface and a schema-2 evidence-aware artifact. TL-U02–U04 delivered
strict validation, atomic replay and indexed inspection. TL-U05–U07 added
source-linked graph/sequence/state-table projection and Explain/Inspect UI.
TL-U08 introduced the single `thl` authoring contract. **TL-U09 now supplies
four typed, independently checked references with matched static comprehension
baselines.**

**The new Remark/MDX `thl` route is schema 2 only**, with native
`ThroughlineEmbed` using `artifactJson`. No domain-tagged fence or v1 source
bridge is accepted by that route. Internal schema-1 code remains as temporary
source scaffolding pending independent U10 migration—not as a maintained
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
events exist. Select the **Sequence** tab in the Visualization view tab list when supported. Graph and State tabs use the same playback cursor; Left/Right and Home/End activate tabs while focus is in the tab list.
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
earlier/newer page controls. The chronological native Sequence lane also mounts at most 120 event rows per page; changing frames returns to the newest page. State displays retained modeled cells independently of presence and current-frame evidence in pages of at most 40 rows.
Switching to Graph or State table retains the current frame and selected
semantic entity. The pure `projectView` auto-choice is stable across frames
and prioritizes implemented compatible author hints.

### Native v2 Explain / Inspect

The schema-2 React player exposes supported **Graph**, **Sequence** and **State** view tabs and a separate **Inspect** toggle. Inspect opens the current step in the Workflow inspector; selecting an entity or transfer opens its context. Expand **Source details**, then a tool such as **Compare steps**, for deeper evidence. The panel docks, overlays or becomes a bottom sheet according to available width; playback remains available. It reads the same selected frame and semantic entity through a pure query:

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

- **One `thl` fence:** strict, offline schema-2 JSON or reviewed prose
  materialization with hash-bound provenance. No old domain tags or
  compatibility router in the new authoring surface.
- **Evidence-aware steps:** explicit writes, modeled topology, independent
  message phases, observations and traceable editorial claims.
- **Deterministic replay and Inspect:** immutable frames, typed state,
  history, diffs, event dependencies and missing-knowledge distinctions.
- **Optional accessible React player:** responsive Graph, Sequence and
  State-table views, keyboard controls, Explain/Inspect and optional narration.
- **Four first-party typed references (TL-U09):** factorial(4), 2×2 matrix
  multiplication, 4-bit binary addition and a **hypothetical** distributed
  checkout/retry scenario. Every model includes a matched static explanation,
  comprehension questions, expected answers and exact source-event IDs.

The checkout reference does not assert a real provider's idempotency guarantee
or conclude that missing acknowledgement evidence proves packet loss.
References' mathematical truth and persistence order are independently tested.
Matched questions are a baseline for future comprehension studies, not
evidence of measured educational improvement.

## Release quality and acceptance

Before v0.2.0 can be published, stable production Mermaid Graph and Sequence rendering must pass TL-U26–TL-U29 parity and cutover gates (see [Mermaid feasibility](docs/mermaid-feasibility.md)). The current development preview is not production acceptance. The final integrated candidate must then pass TL-U18. The source release gate records SHA-bound compile/query/layout measurements, hostile-input rejections, accessible keyboard/browser verification and independent packed-host proof. See the [release-quality acceptance matrix](docs/release-quality.md) for the deterministic inputs, measured runner conditions, automated results and separate manual screen-reader/zoom sign-off. A green automated quality gate is **not sufficient to close TL-U18** until an exact-candidate real screen-reader test is recorded, and does not publish, deploy or establish educational superiority.

## Offline CLI and reviewed Markdown authoring

The unreleased source now includes a standalone Node 24+ binary and a
Node-only trusted host entry. The commands accept only strict schema-2
artifacts, plain `thl` fences and reviewed, SHA-256-bound prose sidecars:

~~~sh
thl validate artifacts/factorial.json
thl materialize --document content/docs/factorial.mdx --ordinal 0 \
  --artifact artifacts/factorial.json --manifest throughline/manifest.json
# Manually review the artifact and the generated unreviewed manifest entry.
thl check content/docs --manifest throughline/manifest.json
~~~

Materialization **never approves** generated artifacts. Hosts can use
`@0xbuff/throughline/node` to map VFile paths and load confined sidecars;
core validation still requires no Node filesystem, React or provider SDK.
See the [CLI and editorial-review procedure](docs/cli.md).

## Installation and version boundary

For this unreleased schema-2 guide, build from reviewed source or use an independently installed source archive. Do not install an unversioned registry package expecting these exports. For the historical v0.1.0 API, use the matching versioned release documentation and pin the corresponding package:

~~~sh
npm install @0xbuff/throughline@0.1.0
~~~

The package targets Node.js 24+ with ESM. The React 19 player is an
optional peer; install React and React DOM in a rendering application:

~~~sh
npm install react@^19 react-dom@^19
~~~

**The schema-2 examples and interfaces described here are source-level,
unreleased changes.** The historical 0.1.0 package must not be assumed to include them. They will be released only after the separate
publication gates; do not assume this README is an assertion of npm delivery.

## Quick start — use a typed reference

~~~ts
import { compileArtifact, inspectTrace, serializeArtifact } from "@0xbuff/throughline";
import { EXAMPLES } from "@0xbuff/throughline/examples";

const example = EXAMPLES.find(item => item.id === "factorial");
if (!example) throw new Error("Missing reference example");

const trace = compileArtifact(example.artifact);
const inspector = inspectTrace(trace);
console.log(inspector.valueAt(trace.frames.length - 1, "result"));
// { status: "known", value: 24 }

const json = serializeArtifact(trace.artifact); // canonical, deterministic JSON
~~~

For a Markdown document, place this structured JSON inside an
unqualified `~~~thl` fence. Remark/MDX validates it without AI, a
network service or a sidecar. Descriptive text instead requires
explicit, reviewed materialization. Read
[universal authoring](docs/grammar.md) and
[framework integrations](docs/framework-integrations.md).

### Render the native player

~~~tsx
import { compileArtifact } from "@0xbuff/throughline";
import { EXAMPLES } from "@0xbuff/throughline/examples";
import { ThroughlineGraphPlayer } from "@0xbuff/throughline/react";
import "@0xbuff/throughline/styles/throughline.css";

const example = EXAMPLES[0];
const trace = compileArtifact(example.artifact);

export function ReferenceDemo() {
  return <ThroughlineGraphPlayer trace={trace} title={example.title} theme="auto" />;
}
~~~

The Graph and Sequence views only render declared facts.
A sequence request without message events falls back to a state table
instead of inventing messages.

## Local development preview

[The Vite playground](playground) uses the checkout reference and the current
player source, with development-only Mermaid Graph and Sequence and the native State table. Public package rendering remains native pending U29.
Use Node.js 24+ and the repository's pinned pnpm version.

~~~sh
pnpm install --frozen-lockfile
pnpm dev
~~~

Open http://localhost:5173 to inspect states and source events and
read the matched explanations/questions at desktop, tablet and mobile
widths. The preview is excluded from the published npm package.

## Public authoring studio

The [Playground authoring studio](playground/studio/README.md) uses the current
native public React player with four reference artifacts, strict JSON editing,
compiler diagnostics and validated JSON/Markdown export. Run `pnpm studio:dev`
and open http://localhost:5174. Build with `pnpm studio:build`; the static site
is separate from the experimental Mermaid host above and from the npm package.
Deployment requires separate maintainer approval.

## Behind the model

1. **Validate:** strict schema-2 input is detached and checked for
   known/unknown state, IDs, references, depth and bounded work.
2. **Compile:** each named step commits its declared writes and topology
   updates atomically; messages/observations never implicitly mutate
   persistent state.
3. **Inspect:** immutable frame checkpoints support indexed state,
   history, diffs, explicit transfers and directly declared dependencies.
4. **Project:** the native viewer maps the same source-linked facts to
   Graph, Sequence and State-table descriptors without synthesizing events.
5. **Explain:** optional React components display those immutable facts
   alongside authored notes, evidence limits and reviewable claims.

Schema 2 is intentionally incompatible with the previous trace
schema. No migration/conversion or backward-compatibility route is
introduced here. The remaining historical internal tests are isolated
pending the separately reviewed v1 cleanup tickets.

## Documentation

- [User guide and player](docs/user-guide.md)
- [Reference catalog](docs/catalog.md) and
  [static explanations and comprehension questions](docs/reference-traces.md)
- [Universal `thl` grammar](docs/grammar.md) and
  [typed reference authoring](docs/authoring.md)
- [Framework integration guide](docs/framework-integrations.md)
- [Offline CLI, safe file loading and manual review](docs/cli.md)
- [Semantic schema-2 runtime](docs/schema-v2.md)
- [Documentation index](docs/README.md)
- [Changelog](CHANGELOG.md) and [release guidance](docs/releasing.md)

## Development

Build and verification commands are documented under
[releasing and checks](docs/releasing.md). Never publish an unreleased
schema-2 API without its own independently verified distribution,
signed release and approval.

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
