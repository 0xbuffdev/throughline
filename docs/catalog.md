# Reference catalog

Throughline now uses **one universal schema-2 VisualArtifact model**.
The names below identify teaching **examples**, not special parser domains.
Every example uses the same compiler, source-linked history and built-in
graph, sequence or state-table projections.

| Model | Initial facts | Explicit transitions | Why inspect it |
| --- | --- | --- | --- |
| [Factorial recursion](../src/reference/factorial.ts) | Empty modeled stack; no return result | Four pushes, base case 1 and returns 2, 6, 24 | Stack history and return arithmetic |
| [2×2 matrix multiplication](../src/reference/matrix.ts) | A, B and an explicitly initialized C | Four row–column dot products and nested writes | Operand terms and changed cells |
| [Unsigned binary addition](../src/reference/binary.ts) | 1011₂, 0110₂, empty 5-bit result | Four sum/carry updates and leading carry | Correct bit order and carry propagation |
| [Distributed checkout](../src/reference/checkout.ts) | Draft order; unknown worker outcome; no charge | Distinct sends/receipts, simulated provider effects, timeout, retry and persistence | Evidence limits, separate knowledge and state |

The public \`@0xbuff/throughline/examples\` export contains four
\`ReferenceExample\` values. Each contains a typed \`artifact\`, a matched
\`explanation\`, \`questions\` with exact evidence IDs and \`caveats\`.
No domain-tagged source syntax or backward-compatibility adapters are provided.

~~~ts
import { EXAMPLES } from "@0xbuff/throughline/examples";
import { compileArtifact, inspectTrace } from "@0xbuff/throughline";

const reference = EXAMPLES.find(example => example.id === "factorial");
if (!reference) throw new Error("Reference not found");
const inspector = inspectTrace(compileArtifact(reference.artifact));
console.log(inspector.valueAt(8, "result")); // {status:"known", value:24}
~~~

The models are **authored teaching artifacts**. Their numerical truth is
checked independently in [reference tests](../src/__tests__/examples.test.ts).
The checkout provider is hypothetical; the fixture does not establish real
payment-provider guarantees, a missing acknowledgement's physical cause,
or any automatic state change implied by a message.

Read [reference explanations and matched questions](reference-traces.md),
[the one-fence authoring contract](grammar.md), and
[Markdown/MDX integration](framework-integrations.md).
