# Schema-2 semantic artifact validation and deterministic replay (TL-U02–U03)

The schema-2 validator and atomic deterministic compiler implement the accepted
semantic foundation. The preexisting schema-1 Markdown parser and player are
not v2 consumers; no backward-compatibility support is promised.
Normative authority: Throughline Specification 0004 §§10–13 (maintainer-owned architecture record).
TL-U04 adds indexed queries; later tickets migrate views, examples and the
single unqualified `thl` fence.

## Public data boundary

```ts
import {
  validateArtifact, parseArtifactJson, serializeArtifact, compileArtifact,
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
```

No resolver, network connection, rendering library or provider SDK participates
in validation or compilation. The input is inert data. `message` and
`observation` events cannot change persistent modeled state.

## Structural and trust rules

- All IDs match `^[A-Za-z][A-Za-z0-9_-]{0,63}$`; namespaces for entities,
  groups, relations, origins, steps, events and claims are independent.
  References must resolve; dependency event IDs must refer to **earlier** steps.
- An entity has exactly one known/unknown initial cell. Known JSON null is not
  unknown. A missing nested path will be `absent` at query time (TL-U04), not
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
while a topology map rejects contradictory presence operations. Valid disjoint
writes commit together. Presence is a property of declared entities and
relations; `focusEntityIds` and UI collapse have no impact on presence.

A `message` with phase `sent` requires its declared relation and both declared
endpoints to be present **before and after** the atomic step; activating an
endpoint within that step is not a send. `received`, `acknowledged` and
`processed` are independently authored evidence and need not imply any earlier
phase. Observations never persist data; only explicit `write` events do.
References to causal predecessors remain explicit, earlier-step-only evidence
validated by TL-U02. Wall timestamps do not reorder steps or establish duration.

The compiler measures every expanded frame, charging each JSON primitive,
property and array element *on every frame*, including unchanged shared values.
An immutable subtree's measured size may be memoized to bound runtime work,
but the expanded cost still counts against the 8,000,000-unit ceiling.
Compiled frames, cells, event IDs and snapshot presence arrays are frozen at
the public boundary; a caller cannot mutate a past state or authored artifact.

**Scope:** This source does not promise schema-1 compatibility, query indexes,
graph/sequence/state-table projections or a v2 player. Those are separate
reviewed implementation tickets TL-U04–TL-U10.

## Acceptance and deferred replay checks

TL-U02 tests positive recursion/matrix/checkout-shaped artifacts and rejects
broken cross-references, malformed and duplicate JSON, invalid paths, dates,
cycles, unsafe input, depth/count/byte/work-limit breaches and mutation leaks.
TL-U03 adds atomic replay, no-false-persistence and endpoint-presence
checks, deterministic checkpoint/mutation tests and expanded-budget rejection.
Queries/projections and a v2 player remain TL-U04–TL-U10 work. Test and release
evidence must be recorded from real CI, not assumed from this documentation.
