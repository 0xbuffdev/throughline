# Universal `thl` source contract

Throughline recognizes exactly one Markdown code-fence language: `thl`.
The info string contains no domain name or additional metadata. Two
mutually exclusive data branches are selected by the first non-whitespace
character of the code body.

## Direct schema-2 JSON

If the body begins with `{`, it must be a complete strict
`VisualArtifact` JSON object. It validates and compiles offline.

~~~thl
{
  "schemaVersion": 2,
  "id": "counter",
  "origins": [{ "id": "author", "kind": "authored" }],
  "entities": [{ "id": "counter", "label": "Counter" }],
  "relations": [],
  "initialState": {
    "counter": { "status": "known", "value": 0 }
  },
  "steps": [{
    "id": "increment",
    "label": "Increment",
    "events": [{
      "id": "counterWrite",
      "originId": "author",
      "type": "write",
      "entityId": "counter",
      "path": [],
      "value": { "status": "known", "value": 1 }
    }]
  }]
}
~~~

A `VisualArtifact` declares semantic facts, not frames or animations:

- **Origins** distinguish authored, computed, simulated, observed and
  AI-proposed data. An origin declaration is not proof of an external event.
- **Entities** and **relations** define named semantic objects and
  directed edges. Groups organize the objects without changing state.
- **Initial state** gives each entity a known JSON cell or an unknown cell
  with an optional reason. Known `null` is different from unknown.
- **Steps** commit named events atomically. An explicit `write` changes
  state. A `topology` event changes modeled presence. `message`
  phases (sent, received, acknowledged and processed) are independent
  evidence and never automatically write. An `observation` is
  non-persistent evidence.
- **Claims** may cite declared event IDs, including transparent assumptions
  or unreviewed statements. The compiler checks references, not scientific
  truth. View hints may prefer graph, sequence or state-table projections.

The source rejects duplicate decoded object keys, unsupported versions,
invalid references, cyclic groups, illegal state writes, contradictory
topology changes, invalid UTF-16/JSON values and resource-limit
violations. A malformed JSON-looking body is **never** reinterpreted
as prose or executable code.

## Inert descriptive intent

If the body does not begin with an opening brace, it is inert
descriptive text:

~~~thl
Explain factorial(4). Show the explicit call-stack push and return steps.
~~~

No runtime executes that text. Published builds require a reviewed,
content-root-confined schema-2 sidecar artifact bound to the document
path, zero-based `thl` ordinal, normalized-LF source SHA-256 and
canonical artifact SHA-256. Unresolved, stale or unreviewed intent
fails closed. No AI provider, remote service or heuristic diagram
is required by the pure engine.

The Remark/MDX host only accepts unqualified `thl` code nodes and
emits inert literal artifact data after all blocks have validated.
See [framework integration](framework-integrations.md) and
[reference authoring](authoring.md) for details.

## Representation limits

The validator caps serialized artifacts at 4 MiB UTF-8, JSON nesting
at 32, entities and groups at 200 each, relations at 1,000, steps at
2,000, events at 10,000 and claims at 1,000. Additional validation
and expanded-trace work budgets apply. The source-intent ceiling is
262,144 UTF-16 units.

This is the **schema-2 contract**. No old `thl flow`,
`thl binary`, `thl matrix`, `thl callstack` or `thl bindings`
routing or compatibility layer is provided in the new authoring
surface. For the full accepted semantic definition, read
[the schema-2 runtime guide](schema-v2.md).
