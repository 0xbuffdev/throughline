# Write a schema-2 model

Throughline models state changes with **one** `VisualArtifact` schema. A stack, matrix, binary operation or message exchange is a different use of the same data model, not a separate language.

## Start with facts

Declare stable IDs for the things being modeled, where information came from, their initial state and the events that change or describe them:

~~~ts
import { compileArtifact, inspectTrace } from "@0xbuff/throughline";
import type { VisualArtifact } from "@0xbuff/throughline";

const artifact: VisualArtifact = {
  schemaVersion: 2,
  id: "counter",
  origins: [{ id: "author", kind: "authored" }],
  entities: [{ id: "counter", label: "Counter" }],
  relations: [],
  initialState: { counter: { status: "known", value: 0 } },
  steps: [{
    id: "increment",
    label: "Increment",
    note: "An explicit write changes the counter to one.",
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
console.log(inspectTrace(trace).valueAt(1, "counter"));
~~~

A step is **atomic**: its events contribute to one committed snapshot. A `message` event records an explicit phase (sent, received, acknowledged or processed) but does not change persistent state on its own. `observation` records evidence; `topology` records modeled presence; only `write` changes a stored value. Known `null` is not the same as unknown or absent.

## Model uncertainty

Describe observed facts as observed, simulations as simulated and assumptions as assumptions. A send does not prove delivery, a missing acknowledgement does not prove loss, and a diagram connection is not an event. Cite source event IDs in explanations and claims; the compiler checks the citation is valid but cannot prove a real-world assertion.

Avoid choosing a more attractive view at the expense of truth. Graph, Sequence, State table and Inspect must all agree on the same frame and source facts.

## Publish a reference example

1. Create a typed model in `src/reference/` using `ReferenceExample` from `src/reference/model.ts`.
2. Supply a concise static explanation, comprehension questions, expected answers and the exact event IDs supporting the explanation. Include caveats where external behavior is hypothetical.
3. Register it in `src/examples.ts`. The exported `EXAMPLES` catalog supplies fresh artifact copies so callers can edit a model without mutating the shared reference.
4. Independently verify expected arithmetic or state transitions, rather than treating the visual output as its own oracle.
5. Test validation, compilation, history, Graph/Sequence/State-table projection, determinism and source selection at initial and later frames. For rendered behavior, test keyboard navigation, accessible text and small-screen layouts.
6. Run the relevant [contributor checks](../CONTRIBUTING.md) and inspect packaged-consumer results.

The four existing [reference models](catalog.md) provide patterns for algorithmic and distributed examples. They are authored teaching models, not recorded executions or proof of a measured learning improvement.

## Author from Markdown

An unqualified `thl` fence accepts strict schema-2 JSON directly. If the body is descriptive prose, it requires an independently reviewed and SHA-256-bound sidecar generated with the offline `thl materialize` workflow. The compiler does not turn prose into a model by itself.

See [the authoring grammar](grammar.md), [the CLI review procedure](cli.md), and the [precise schema contract](schema-v2.md). Specialized visual renderers can be added later without changing the artifact's semantic truth.
