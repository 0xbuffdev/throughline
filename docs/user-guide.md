# Throughline user guide

Throughline helps readers examine **authored semantic state across
explicit steps**. The native schema-2 model separates data and evidence
from the viewer. Its source uses one `thl` code-fence language and one
`VisualArtifact` schema, regardless of whether the subject is a stack,
matrix, bit operation or distributed service.

**Version note:** this describes the **unreleased schema-2 source**.
Verify the installed package has the documented exports. A v0.1.0 npm
install must not be assumed to expose this pre-release contract.

## Direct JSON quick start

An ordinary `thl` code block can contain exact schema-2 JSON:

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
    "note": "The counter is explicitly written to one.",
    "events": [{
      "id": "counterWrite",
      "type": "write",
      "originId": "author",
      "entityId": "counter",
      "path": [],
      "value": { "status": "known", "value": 1 }
    }]
  }]
}
~~~

There are two frames: an initial value 0 and a committed value 1.
The compiler does not run arbitrary JavaScript or infer changes from
a note, a graph edge or a message.

For a **standalone programmatic** example, obtain the JSON body from a
published, independently checked reference. This sample inspects factorial(4)
rather than relying on a variable implicitly created by the Markdown fence:

~~~ts
import {
  resolveThlBody, compileArtifact, inspectTrace, serializeArtifact
} from "@0xbuff/throughline";
import { EXAMPLES } from "@0xbuff/throughline/examples";

const example = EXAMPLES.find(item => item.id === "factorial");
if (!example) throw new Error("Missing factorial reference");
const jsonBody = serializeArtifact(example.artifact);
const model = resolveThlBody(jsonBody);
const trace = compileArtifact(model);
const inspect = inspectTrace(trace);
console.log(inspect.valueAt(trace.frames.length - 1, "result"));
// { status: "known", value: 24 }
~~~

The strict JSON branch requires **no manifest or provider**. Invalid JSON
never falls through to prose. Typed records and values remain inert data;
unsupported versions, duplicate keys, invalid references and excess work
fail validation.

## Read the four reference models

The public `@0xbuff/throughline/examples` export exposes four
typed schema-2 examples, each with an explanation, matched questions,
expected answers, source evidence IDs and caveats:

- **Factorial:** push four modeled calls, return 1, 2, 6 and 24.
  These are authored mathematical frames, not a real runtime trace.
- **Matrix:** explicitly calculate the four cells of a 2×2
  multiplication, with inspectable intermediate dot-product terms.
- **Binary:** walk low-to-high carry propagation and the unsigned
  five-bit result 10001₂ (17₁₀).
- **Checkout:** follow a request, worker uncertainty, a retry using the
  same key, simulated provider deduplication and separate persistence.
  This is **not** evidence of real provider behavior or a lost packet.

[See the reference catalog](catalog.md) and
[matched static explanations and questions](reference-traces.md).

## View an artifact in React

The renderer is an optional React 19 entry point and is independent
of the pure compiler:

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

The player's **Graph** view exposes source-linked semantic objects and
declared relationships. **Sequence** displays only modeled message
phases; absent receipts and acknowledgements are not invented.
**State table** exposes known/unknown cells and explicit writes.
Tabs appear only for projections the artifact supports across its entire timeline;
for example, factorial has Graph and State tabs, while Checkout also has Sequence.
An incompatible programmatic view request falls back to a truthful state table.

Use the playback controls to step backward or forward. Choose **Go to step**
in Options to open a specific frame. The graph opens at readable scale and
centers sparse content. Nodes have compact measurements that remain stable
through the trace. Directed acyclic relationships use structural levels;
cycles retain a deterministic centered grid. Nodes show scalar values or collection
counts rather than raw JSON. Selecting a node opens a value inspector with
expandable fields; exact source JSON remains available in bounded segments.
Use **Fit to view** for a whole-scene overview, or **Follow active** to center
authored focus without automatically magnifying it. Following starts off;
manual panning, zooming or fitting pauses it until you enable it again.
Selecting a group in Options centers its existing geometry without moving nodes.
The inspector opens on the right in wider embeds and as a bottom sheet in narrow
embeds, leaving playback available. Inspection and causal evidence use the same
compact typography. Wide evidence tables scroll horizontally inside their own
labeled regions, while the inspector provides the vertical reading scroll.
The State view retains native table headers and explicit presence/value labels.
Sequence reserves declared message participants from the start. Arrows connect
their lifelines only for explicit sends; receipt, processing and acknowledgement
remain separate phase markers. Motion occurs only on forward sends and is
disabled for reduced-motion preferences, direct seeking and rewind.
Escape closes the inspector or Options and
returns focus to its control. Options provides timeline restart, direct step
navigation and supported display controls. **Inspect** summarizes the current
step. Select a node or State row for its current value and latest update. Select
an arrow to see the sender, recipient and recorded phases. Expand **Source
details** for exact values, history, frame comparisons and source evidence IDs.
Collapsing a group and changing presentation cannot change committed state.
Keyboard-accessible controls and reduced-motion presentation apply;
narration is optional and must not alter the model.

Run `pnpm dev` from the source repository to open the checkout player preview
at desktop, tablet or mobile widths. The preview includes checkout's explanation
and source evidence.

## Markdown and MDX hosts

The optional `@0xbuff/throughline/remark` entry validates unqualified
`thl` code nodes without importing React. In explicit MDX mode it
prevalidates every block and injects a registered
`ThroughlineEmbed` with **only literal `artifactJson` data**;
the host supplies the React component and stylesheet.

Prose intent, such as a request to "explain factorial(4)", is
**not** directly compilable. It requires a reviewed, SHA-256-bound
schema-2 artifact supplied by a trusted host. A VFile with an absolute
path requires trusted `documentForFile` mapping to a
repository-relative sidecar locator. Missing or stale sidecars, unsafe
paths, and loader failures produce stable diagnostics; no compiler
call triggers AI or network access.

See [universal fence grammar](grammar.md) and
[framework integrations](framework-integrations.md). The
filesystem-confined command-line materialization/check workflow
is a separate release-gated implementation.

## Understanding evidence and limits

A source `sent` message is not a source `received` message, a
processed phase is not a persistent write, and a timeout does not
prove decline. The snapshot after a step is atomic: event-list order
does not imply intermediate committed states or elapsed time.
Review claims and their cited event IDs; distinguish editorial
assumptions from externally observed facts.

The core is offline and has bounded JSON, entity, relation, event,
claim and expanded-replay work. It does not execute an untrusted
code fence, provide a universal code interpreter, simulate real
networks or measure learning improvement.

For precise ceilings and source-linked query contracts, read
[the semantic schema-2 guide](schema-v2.md). For questions about
practical authoring and proof, read [reference authoring](authoring.md).
