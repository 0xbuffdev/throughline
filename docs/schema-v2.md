# Schema-2 semantic runtime and graph/sequence views (TL-U02–U06)

The schema-2 validator, deterministic compiler and indexed inspector implement
the pure semantic foundation. TL-U05 adds the native graph projection and React
player; TL-U06 adds the source-linked sequence projection, accessible evidence
timeline and deterministic all-three-view selection without a v1 adapter.
The preexisting schema-1 Markdown parser and player remain separate while
TL-U07–TL-U10 deliver full Inspect/history UI, one-fence authoring and host
integrations. No backward-compatibility promise is made.
Normative authority: Throughline Specification 0004 §§10–13 (maintainer-owned architecture record).

## Public data boundary

```ts
import {
  validateArtifact, parseArtifactJson, serializeArtifact, compileArtifact,
  inspectTrace, projectView,
  type VisualArtifact
} from "@0xbuff/throughline";

const source: VisualArtifact = {
  schemaVersion: 2,
  id: "counter",
  origins: [{ id: "author", kind: "authored" }],
  entities: [{ id: "counter", label: "Counter" }],
  relations: [],
  initialState: { counter: { status: "known", value: 0 } },
  steps: [{
    id: "increment", label: "Increment", events: [
      { id: "write1", type: "write", originId: "author", entityId: "counter",
        path: [], value: { status: "known", value: 1 } }
    ]
  }]
};

const validated = validateArtifact(source); // detached, deeply frozen
const json = serializeArtifact(validated);   // deterministic, sorted object keys
const decoded = parseArtifactJson(json);     // strict duplicate-key checking
const trace = compileArtifact(decoded);      // detached, immutable derived frames
console.log(trace.frames.map(frame => frame.id)); // ["@initial", "increment"]
const inspect = inspectTrace(trace);
inspect.stateAt(0);                     // immutable initial state
inspect.valueAt(1, "counter");          // {status:"known", value:1}
inspect.valueAt(1, "counter", ["x"]);   // {status:"absent"}
inspect.diff(0, 1);                    // explicit write with eventId "write1"
inspect.history("counter");            // authored writes, never fabricated effects
inspect.causalEvidenceOf("write1");    // unmodeled: no declared dependency
const graph = projectView(inspect, { kind: "graph", frameIndex: 1 });
// The graph is renderer-independent; every item has exact semantic source IDs.
```

No resolver, network connection, rendering library or provider SDK participates
in validation or compilation. The input is inert data. `message` and
`observation` events cannot change persistent modeled state.

## Structural and trust rules

- All IDs match `^[A-Za-z][A-Za-z0-9_-]{0,63}$`; namespaces for entities,
  groups, relations, origins, steps, events and claims are independent.
  References must resolve; dependency event IDs must refer to **earlier** steps.
- An entity has exactly one known/unknown initial cell. Known JSON null is not
  unknown. A missing nested path is `absent` at query time, not
  inserted into the serialized artifact. Unknown knowledge is whole-entity.
- Only four semantic events are accepted: `write`, `topology`, `message`,
  `observation`. A message phase is evidence, not an implicit destination write.
  `messageId` cannot correlate events on different relations.
- Static groups use explicit parent IDs, have no cycles, and have depth at
  most 32. Relations reference predeclared entities. View choices do not
  mutate modeled presence.
- Nested write paths comprise strings (excluding `__proto__`, `prototype`,
  `constructor`) or nonnegative safe integer indexes. Only root writes may
  set an unknown cell. Runtime nested-value compatibility, atomic write
  conflicts, sent-message endpoint presence and replay budgets belong to
  the **TL-U03 compiler**.
- Logical ticks are nonnegative safe integers. Wall timestamps have explicit
  offsets and parseable RFC 3339 calendar dates. Neither clock implies step
  duration or causal order.
- Known JSON values reject functions, symbols, nonfinite numbers, cycles,
  unsafe keys, accessors, custom prototypes, invalid UTF-16 and sparse arrays.
  Validation only reads own data properties. Modern JavaScript has no portable
  foolproof test for a transparent Proxy; the validator fails closed on
  uninspectable/trapping inputs, and does not promise side-effect-free contact
  with hostile Proxy traps.
- The JSON reader checks duplicate decoded keys (including escaped aliases)
  *before* `JSON.parse`; plain `JSON.parse` silently accepts duplicate keys.
  The reader rejects extra root and nested schema fields and version mismatches.

## Resource ceilings

| Bound | Value |
| --- | ---: |
| Serialized artifact size | 4 MiB, UTF-8 |
| Deterministic input traversal budget | 1,000,000 units |
| Expanded compiled-trace budget | 8,000,000 units |
| JSON nesting | 32 |
| Entities / relations / groups | 200 / 1,000 / 200 |
| Steps / events / claims | 2,000 / 10,000 / 1,000 |

One traversal unit is an inspected JSON value, array entry or object property;
shared object subtrees are charged each time they expand. Strict text parsing
charges its lexical traversal against the same per-read budget. Typed reference
checks are further bounded by the fixed structural ceilings. The limits are
independent ceilings: approaching one can make another impossible to reach.

## Serialization and migration

Schema 2 is intentionally incompatible with v1 `Program.version: 1` and
`Trace.version: 1`. The validator rejects v1 objects, externally supplied
compiled frames and unknown versions. There is no implicit migration, coercion,
legacy domain-tag compatibility or trust of an asserted `schemaVersion`.
Source examples, authoring and the player migrate as separate reviewed work.
The authoring and sidecar interface belongs to TL-U08/TL-U10. The future
`ThroughlineDocument`/`VisualPlan` envelope is **not** a schema-2
`VisualArtifact`; TL-U21 explicitly owns that optional fidelity layer.

`serializeArtifact` canonically sorts object keys, preserving all array
orders and authored event IDs. It is stable across object insertion order.
This is an artifact JSON serialization guarantee, **not** a published
cryptographic digest contract. Externally serialized compiled traces remain inadmissible. Call
`compileArtifact` with a validated artifact (which is revalidated at the compiler
boundary) to reconstruct frames deterministically.


## TL-U03 — Replay, checkpoint and atomicity contract

`compileArtifact(input: VisualArtifact): CompiledTrace` validates/detaches the
complete input before touching its steps. Frame zero is `@initial`; every
subsequent frame is the committed state after one **whole** ordered step. Each
frame stores an immutable state snapshot and exactly that step's ordered event
IDs, not fictitious intermediate states. The label/time/note/focus fields do
not mutate the semantic state.

Persistent state has known or unknown whole-entity cells. Root writes replace
a cell; nested writes replace **existing** array elements or plain-record keys
inside a known cell. Nested writes are path-copy-on-write and share frozen
unchanged structure, so old frames remain unchanged even when a later step
writes a matrix cell or nested stack record. Array growth, implicit record
creation and unknown-cell partial patching are rejected.

Within a step, writes are checked against the same previous snapshot. A
prefix trie rejects overlapping paths on one entity (including root vs child),
while a topology map rejects contradictory presence operations. The same
write trie is the **single pending-write source**: disjoint updates commit in
one copy-on-write traversal, cloning each affected array/record **once per
step** rather than once per event. Presence is a property of declared entities
and relations; `focusEntityIds` and UI collapse have no impact on presence.

A `message` with phase `sent` requires its declared relation and both declared
endpoints to be present **before and after** the atomic step; activating an
endpoint within that step is not a send. `received`, `acknowledged` and
`processed` are independently authored evidence and need not imply any earlier
phase. Observations never persist data; only explicit `write` events do.
References to causal predecessors remain explicit, earlier-step-only evidence
validated by TL-U02. Wall timestamps do not reorder steps or establish duration.

The compiler measures every expanded frame, charging each JSON primitive,
property and array element *on every frame*, including unchanged shared values.
For event IDs and modeled-presence ID arrays, the **array entry and its ID
string primitive each consume one traversal unit**, exactly as for cell
arrays. An immutable subtree's measured size may be memoized to bound runtime
work, but the expanded cost still counts against the 8,000,000-unit ceiling.
Compiled frames, cells, event IDs and snapshot presence arrays are frozen at
the public boundary; a caller cannot mutate a past state or authored artifact.

### Measured near-limit compilation (non-SLA evidence)

The TL-U03 boundary regression validates a single atomic step containing
**10,000 distinct indexed writes** into a known numeric array of **200,000
entries**. The old per-event array copy performed approximately 2 billion
element-definition operations. The batched version traverses the touched
array only once during commit and preserves the unchanged initial frame.

- **Fixture (canonical JSON SHA-256):**
  `8e038de327785546936739f5b5309d4952ebc631e2ef0244ff68c0c6b6a09572`
- **Execution:** `compileArtifact` completed in **950 ms** on the recorded
  GitHub Actions Linux runner with an **AMD EPYC 7763 64-Core Processor**,
  **Node.js v24.22.2**, on 2026-11-14.
- **Reproduction:** `src/__tests__/artifact-v2-compiler.test.ts` boundary
  regression; [CI run 43633490421](https://github.com/0xbuffdev/throughline/actions/runs/43633490421).
  The test prints the machine, fixture digest and measured duration.
- **Independent budget regression:** 200 present entities, 1,000 declared
  present relations and 2,000 empty steps must **reject** because expanded
  ID-string accounting pushes the trace beyond 8M units.

This is one reproducible **observation**, not a portable time guarantee or a
performance claim about different hardware, runtimes or input distributions.

**Scope:** This source does not promise schema-1 compatibility, query indexes,
graph/sequence/state-table projections or a v2 player. Those are separate
reviewed implementation tickets TL-U04–TL-U10.

## TL-U04 — Pure indexed semantic inspection

`inspectTrace(trace: CompiledTrace): TraceInspector` requires an **in-process,
compiler-owned** trace. It rejects a JSON-deserialized, forged or reassembled
`CompiledTrace` even if its `schemaVersion` is 2: compile a validated
`VisualArtifact` instead. Traces and query results are immutable, detached
from the caller's original input, and do not invoke React, AI or network code.

The inspector indexes authored event IDs, entity-associated events, declared
relations, message transfers, explicit write history, authored claims and
earlier-step causal dependencies exactly once per trace. Queries do not replay
the artifact or scan every step to resolve an event ID:

| Query | Semantics |
| --- | --- |
| `stateAt(frameIndex)` | Frozen snapshot at a strict zero-based frame index; `@initial` is index 0 |
| `valueAt(frameIndex, entityId, path?)` | Known JSON, unknown whole-entity cell or distinct absent nested path |
| `diff(from, to)` | Forward-only (`0 <= from <= to < frameCount`) explicit writes and **presence** changes, including same-value writes |
| `history(entityId, path?)` | Explicit overlapping writes, with **before/after evaluated at the requested path** (or the original event path when omitted); no inferred persistence |
| `eventsFor(entityId)` | Explicit direct entity events plus messages and topology operations on incident declared relations |
| `transfersFor(relationId)` | Only authored `message` events, including lone received/processed phases |
| `dependenciesOf(eventId)` | Only declared `dependsOn` event references from earlier steps |
| `causalEvidenceOf(eventId)` | `explicit` for declared dependencies; otherwise `unmodeled` and an explanatory text |
| `eventById(eventId)` / `claimsForEvent(eventId)` | Exact authored event and explicit citing claims; `reviewed` is editorial, not independent scientific proof |
| `relationsFor(entityId)` | Static declared incident relations; check `stateAt` for modeled presence at a frame |

**Frame and result semantics:** `diff(from,to)` validates two existing
zero-based frame indices and **requires `from <= to`**. It includes commits
strictly after `from` through `to`, ordered by authored step and event
order. `diff(from,from)` is empty; reverse ranges throw a typed
`TraceQueryError` and are not an implicit undo feature.

Every explicit write change and `HistoryEntry` includes `frameId` (the
authored step ID), `frameIndex`, `eventId`, `originId` and `path` (the
**original write target**). A presence change uses `kind:"presence"`,
`frameId`, `eventId`, `target`, `targetId`, and boolean `before`/`after`
fields. History path-filtering preserves the source event identity/path, but
reads before/after from **the requested location** in adjacent immutable
frames: a child write queried at its parent returns parent cells; a
whole-parent write queried at a child returns the child's actual prior and
committed values (including a transition to/from `absent`).
Without a path, each history entry reports values at its original write
target. Same-step writes always compare the preceding and committed frames,
never imaginary intermediate states or inferred causal effects.

**Nested paths:** unknown whole-entity cells stay unknown even for a nested
query. Missing or incompatible keys/indices inside a known value return
`{status:"absent"}`, distinct from `{status:"known",value:null}`. Values
on declared but initially absent entities remain queryable separately from
modeled presence. Paths reuse the schema's safe string/index vocabulary and
are limited to depth 32 at the read boundary. Invalid frame indexes and
undeclared IDs throw `TraceQueryError` rather than disguising invalid input
as an absent value.

**No invented evidence:** `observation` and `message` do not appear as
writes in diff/history; `transfersFor` does not imply receipt, persistence
or missing phases. Chronological adjacency is not a dependency. An empty
`dependenciesOf` list means no explicit cause is modeled, **not** that the
event had no real-world cause.

The 10k-event/2k-step pure index benchmark lives in
`src/__tests__/artifact-v2-inspector.test.ts`. The final measured fixture
(**canonical JSON SHA-256**
`63e10c7b1b32404f39372f85cac49e023da7e07b76467ea6ee6d4f2493d0af28`)
contains **2,000 ordered steps and 10,000 disjoint explicit writes**.
On the 2026-11-14 GitHub Actions **Linux Intel Xeon 6975P-C** runner using
**Node.js 24.22.2**, compiling and indexing the fixture took **167.8 ms**;
10,000 independent `eventById` / `stateAt` lookup pairs, including Vitest
assertions, took **177.8 ms**. Reproduction:
[CI run 43634893438](https://github.com/0xbuffdev/throughline/actions/runs/43634893438).
The fixture hash, hardware and observed timings are emitted by the test.
This is measured evidence **on that runner**, not a cross-hardware latency SLA.

## TL-U05 — Pure graph projection and native React player

The accepted `ViewRequest`, `ViewDescriptor`, `ViewItem` and `SourceIds`
contracts are available from the root package. A projection is a deeply
immutable renderer-independent collection of items, each retaining at least
one validated source group/entity/relation/event ID and a meaningful text
description. **Visual item IDs are local to a projection. Cross-frame or
cross-view selection always uses the original semantic entity IDs.**

~~~ts
const inspect = inspectTrace(compileArtifact(source));
const view = projectView(inspect, {
  kind: "graph",
  frameIndex: 1,
  selectedEntityIds: ["left"],
  collapsedGroupIds: [],
});
console.log(view.frameId);           // authored step ID
console.log(view.items[0]?.source);  // exact frozen semantic source IDs
~~~

`projectView` requires an authentic `inspectTrace` instance backed by a
compiler-owned in-process trace; cloned JSON or forged inspectors are refused.
The request must name a valid frame and any selected/collapsed group IDs must
resolve to the original artifact. The projector never fetches, executes code,
or mutates semantic state.

**Graph presence and evidence:** Only entities marked present in the selected
frame, and relations marked present **with both endpoints present**, draw as
nodes and links. The source step's `message` phase `sent` alone marks a
connector as a currently authored send. `received`, `acknowledged` and
`processed` are independently listed evidence, not inferred sends. Neither
messages nor observations write canonical cells. A historical workflow trail
marks only explicit **sent** phases in or before the selected frame, not
fabricated responses or persistence. Each event's declared `originId` and
origin kind (authored, computed, simulated, observed or AI-proposed) are shown
as **provenance metadata**, not independently verified truth. An
observation-family event or presence change is not automatically “observed”
or “authored”; its declared origin is a separate fact.

**Static nested groups:** Groups are declared in the validated artifact.
`collapsedGroupIds` is presentation-only: hidden member nodes are replaced
by a local summary whose provenance retains the contributing present
source entity/group and internal relation/event IDs, **plus source IDs and
event IDs for absent entities or relations explicitly affected at the
current step** (for example, a topology removal). The summary's
`data.count` still counts only *currently present* members; removed
members/links remain absent from the drawn graph. Group source event IDs
retain the authored event-list ordering independently of event origin kind.
Parallel outward relations collapse to one visual connector but retain
**all** source relation IDs. Internal links are never drawn as invented
group self-loops. Expanding restores original source nodes; no topology
event or data mutation is emitted.

Layout is based on declared identities independently of modeled presence,
so seeking never reparents or repositions an entity merely because the trace
frame changes. **Ancestor panels are painted before their descendants,
regardless of declaration order**, with stable sibling ordering, to avoid
opaque parent backgrounds covering child labels. The pure edge router is
reused from the existing layout module; there is no adapter through legacy
`Program.version:1`.

**Three view descriptors:** `graph`, `sequence`, and `state-table`
are implemented. Explicit incompatible `sequence` requests (no message
events anywhere in the validated artifact) and graph-incompatible requests
return the honest state/event table with a diagnostic. Omitted `kind` uses
the entire immutable artifact to pick valid implemented author hints by
ascending priority, tie-breaking `sequence > graph > state-table`; without
a compatible hint, any authored message event chooses sequence, else a
modeled-present graph link chooses graph, else state-table. Seeking never
silently switches the automatically selected view.
TL-U07 delivers full Inspect/history UI and guided evidence navigation.

**Native React:** `ThroughlineGraphPlayer` is exported solely from
`@0xbuff/throughline/react`, consuming `CompiledTrace` directly. It reuses
the pure geometry/camera math, accessible playback transport and optional
browser speech lifecycle (voice initially off; never a core dependency).
Frame seeking, step captions, evidence listing, source-based selection,
read-only group collapse, pan/zoom/fit, focusable keyboard controls and
source-linked SVG descriptions are available. A separate v2 state table
fallback is readable and never promotes observations to durable writes.
The old `ThroughlinePlayer` remains a temporary schema-1 entrypoint, **not
a new compatibility API**; migrate internal examples/MDX in TL-U08–TL-U10.

Regression coverage includes distributed checkout (isolated receives,
processed-without-sent evidence, explicit settlement write, preactivation
and removal), child-before-parent declarations, exact source IDs of
removed constituents under collapse, mixed-origin event descriptions,
cross-frame immutable seeking and invalid trusted objects. Chromium,
Firefox, WebKit, mobile widths, keyboard/selection and packed Node/React SSR
are release evidence gates on the source PR, not substitute claims of human
understanding. Near-cap 200-entity/1000-relation layout tests record hardware
and a fixture SHA-256; timings are observations, not portable SLAs.

## TL-U06 — Cumulative, explicit message sequence evidence

`projectView(inspector, { kind: "sequence", frameIndex })` now returns a
pure, frozen `ViewDescriptor` backed by the **same compiler-owned inspector**
used by graph and state-table. The sequence is cumulative only through the
selected committed frame, ordered by authored step and event order. No
unselected future evidence leaks into a past frame. This is **not** a
reconstruction of verified network chronology or an inference of causal
edges.

The sequence contains three kinds of source-linked items:

- **Actor `role:"entity"`:** a declared endpoint of a message modeled by
  the selected frame, with its exact source entity ID, `selected` flag and
  modeled **presence at the selected frame**. Absence at that frame is not a
  claim about the actor's presence when an earlier event was recorded.
- **Message correlation `role:"value"`:** a deterministic summary for each
  message ID, on its validated declared relation. It retains all contributing
  explicit event IDs, both endpoint IDs and the relation ID. The `data.phases`
  object counts independent `sent`, `received`, `acknowledged`, and
  `processed` events, including separately authored duplicates. Missing
  phases appear as `unmodeledPhases`, **never** a fabricated missing event or
  proof of lost/delivered/acknowledged messages.
- **Timeline `role:"event"`:** all explicitly authored message, write,
  observation and topology facts through the frame, preserving source
  event/entity/relation IDs, frame/step IDs, origin ID/kind and original
  authored order. Message rows point to their declared relation endpoints.
  Non-message facts do not receive a message phase. When a non-`sent` phase
  appears without an earlier modeled `sent` for that message ID, the row
  flags an **evidence gap**, not proof no send occurred. The validator rejects
  the same message ID on unrelated relations.

**Distributed retry example:** The reference test fixture
`src/__tests__/v2-sequence-fixture.ts` explicitly models an initial send,
a received/processed report, an observation of missing acknowledgement,
a separate timeout **write**, a distinct retry send/receipt/acknowledgement,
an orphan acknowledged import and a repeated receipt. The initial
acknowledgement stays *unmodeled*; the timeout is a state/observation
fact, not a fifth message phase. Message phases never mutate the receiver
cell. The only causality modeled is explicitly declared `dependsOn` (e.g.
retry depends on the prior timeout write), not arbitrary temporal adjacency.

~~~ts
const inspector = inspectTrace(compileArtifact(retryCheckout()));
const beforeRetry = projectView(inspector, { kind: "sequence", frameIndex: 4 });
const afterRetry = projectView(inspector, { kind: "sequence", frameIndex: 7 });
// beforeRetry reports original acknowledgement as unmodeled;
// afterRetry reports a modeled acknowledgement for the retry ID only.
// retryCheckout() is the example artifact from the cited test fixture.
~~~

**Native player:** `ThroughlineGraphPlayer` supports `initialView="sequence"`
or a Sequence selection in Player options. Frame playback, keyboard seeking
and selected **source entity ID** are shared with Graph and State table.
The accessible sequence region includes actor selection, message-ID phase
summaries and a literal event table with step, source event, message ID,
declared endpoints, phase/evidence type and declared origin. The browser
renders the latest 120 event rows initially and provides **Show earlier
evidence** to progressively reveal all older rows; summaries count the
complete modeled prefix. Render pagination does not prune the pure
descriptor or invent evidence. The view remains readable on a narrow host,
and HTML is React-escaped inert text, not executable content.

The accepted resource ceiling remains 2,000 steps and 10,000 events.
A pure near-limit benchmark records SHA-256, runner hardware, runtime and
measurement for the full sequence descriptor; results are evidence for that
runner, never a portable render/latency SLA. The full history/diff/claim
navigation UI remains TL-U07.

## Acceptance and deferred replay checks

TL-U02 tests positive recursion/matrix/checkout-shaped artifacts and rejects
broken cross-references, malformed and duplicate JSON, invalid paths, dates,
cycles, unsafe input, depth/count/byte/work-limit breaches and mutation leaks.
TL-U03 adds atomic replay, no-false-persistence and endpoint-presence
checks, deterministic checkpoint/mutation tests and expanded-budget rejection.
TL-U05 added the graph and native v2 player; TL-U06 added sequence
and deterministic auto-view selection. Full Inspect/history UI, unified
authoring and packed-host migration remain TL-U07–TL-U10 work. Test and release evidence must be recorded from real CI,
not assumed from documentation alone.
