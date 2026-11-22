# Authoring schema-2 reference models

Throughline's authoring system has one semantic artifact and one code-fence
language. It does not register special `flow`, `binary`, `matrix` or
`callstack` parsers. New examples are typed authored data, not executable
domain-specific syntax.

## Define an artifact

Use `VisualArtifact` with `schemaVersion: 2`, declared origins, entities,
relations, initial cells and ordered steps of explicit events.

~~~ts
import type { VisualArtifact } from "@0xbuff/throughline";
import { compileArtifact, inspectTrace, serializeArtifact } from "@0xbuff/throughline";

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
    note: "The counter is explicitly written to 1.",
    events: [{
      id: "counterWrite",
      originId: "author",
      type: "write",
      entityId: "counter",
      path: [],
      value: { status: "known", value: 1 }
    }]
  }]
};

const trace = compileArtifact(artifact);
console.log(inspectTrace(trace).valueAt(1, "counter"));
const strictJson = serializeArtifact(trace.artifact);
~~~

An event may be a `write`, `topology` change, `message` phase or
non-persistent `observation`. A message never mutates persistent state
on its own. Observations never imply writes. For any external system
claim, declare what is authored, simulated or actually observed and
identify the evidence or knowledge that is missing.

## Model a file import

Start with the two participants and a directed relation. Give each phase its
own event ID. Reuse the message ID for the send and receipt. Add a separate
write when the file is indexed.

~~~thl
{
  "schemaVersion": 2,
  "id": "fileImport",
  "title": "Import a file",
  "origins": [{ "id": "author", "kind": "authored" }],
  "entities": [
    { "id": "uploader", "label": "Uploader" },
    { "id": "importer", "label": "Import service" }
  ],
  "relations": [
    { "id": "submit", "from": "uploader", "to": "importer", "label": "Import file" }
  ],
  "initialState": {
    "uploader": { "status": "known", "value": "ready" },
    "importer": { "status": "unknown" }
  },
  "steps": [
    {
      "id": "send",
      "label": "Uploader submits the file",
      "events": [
        { "id": "fileSent", "originId": "author", "type": "message",
          "relationId": "submit", "messageId": "import1", "phase": "sent" }
      ]
    },
    {
      "id": "receive",
      "label": "Import service receives the file",
      "events": [
        { "id": "fileReceived", "originId": "author", "type": "message",
          "relationId": "submit", "messageId": "import1", "phase": "received",
          "dependsOn": ["fileSent"] }
      ]
    },
    {
      "id": "index",
      "label": "Import service indexes the file",
      "events": [
        { "id": "fileIndexed", "originId": "author", "type": "write",
          "entityId": "importer", "path": [], "value": { "status": "known", "value": "indexed" },
          "dependsOn": ["fileReceived"] }
      ]
    }
  ]
}
~~~

Paste the fence into a Markdown file and run `thl check your-file.md`.
In the player, the first step with an event shows one arrow from Uploader
to Import service. Select the transfer and step forward to see the recorded
receipt. The Import service value reads **Unknown** through receipt and
changes to **indexed** at the final step. Open **Inspect this step** from
the caption and expand **Source details** to follow the write's declared
dependency on the receipt.

## Build a first-party reference

1. Add a typed example to `src/reference/`, using the shared
   `ReferenceExample` type from `reference/model.ts`.
2. Include an explicit, bounded initial state; every meaningful
   transition should have a stable event ID, descriptive step label,
   truthful note and declared origin.
3. Supply a **matched static explanation**, comprehension questions,
   expected answers, cited event IDs and evidence caveats. These are
   the baseline materials for future user studies; do not claim
   measured improvements without evidence.
4. Export the reference in `src/examples.ts` so Node and Markdown
   consume the same semantic source.
5. Write independent truth assertions. For arithmetic, recompute
   expected values outside the view. For networks, check send,
   received, processed and persistent writes separately.
6. Run validation, compilation, queries, and graph/sequence/state-table
   projections at initial, middle and final frames. Verify source
   IDs and deterministic canonical JSON. The same modeled facts
   must survive switching views and seeking.
7. Run the package's full TypeScript, pure, browser and packed-host
   verification. The CI harness checks both source-only and React
   environments.

A special matrix renderer, voice provider or code interpreter is **not**
required to model matrix or stack facts. Specialized visual providers
must be reviewed separately; their existence must not change or fabricate
the canonical artifact.

## Author the model in Markdown

Use an unqualified `thl` fence. An object opening brace selects a
**strict schema-2 JSON artifact**, compiled offline. Any other nonempty
body is **inert prose**, requiring a trusted, reviewed and hash-matched
sidecar artifact at build time. Prose cannot compile in the pure core,
and the engine never calls an AI provider to guess a diagram.

See [syntax and data contract](grammar.md) and
[host integration and reviewed materialization](framework-integrations.md).
The filesystem-confined CLI operations are separately gated under TL-U10.

## Review questions

Ask whether the example states exactly what is known, whether a derived
result has an independent oracle, whether any drawn link is being mistaken
for an actual side effect, and whether the text distinguishes authored
assumptions from verified external evidence. Reject a reference that
fails these checks even if its diagram looks plausible.
