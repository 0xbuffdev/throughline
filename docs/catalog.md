# Reference examples

Throughline includes four schema-2 models to show what the engine can express. They all use the same compiler and inspector; none requires a special language such as `thl binary` or `thl matrix`.

| Example | What it models | What to examine |
| --- | --- | --- |
| [Factorial of four](../src/reference/factorial.ts) | Calls, a base case and explicit return values | Call-stack state, unwinding and the result 24 |
| [2×2 matrix multiplication](../src/reference/matrix.ts) | Four row-by-column dot products | Intermediate values and nested writes |
| [Unsigned binary addition](../src/reference/binary.ts) | `1011₂ + 0110₂ = 10001₂` | Carries and low-to-high bit updates |
| [Distributed checkout retry](../src/reference/checkout.ts) | A *hypothetical* request, uncertainty, retry and separate persistence | What was sent, received, modeled, and remains unknown |

Every item in `EXAMPLES` contains `id`, `title`, `description`, a typed `artifact`, a matched `explanation`, `questions`, and `caveats`. Questions include expected answers and source event IDs. The catalog returns a fresh artifact object each time, so modifying a local example does not change the published reference.

~~~ts
import { EXAMPLES } from "@0xbuff/throughline/examples";
import { compileArtifact, inspectTrace } from "@0xbuff/throughline";

const factorial = EXAMPLES.find(example => example.id === "factorial");
if (!factorial) throw new Error("Missing example");
const trace = compileArtifact(factorial.artifact);
console.log(inspectTrace(trace).valueAt(trace.frames.length - 1, "result"));
// { status: "known", value: 24 }
~~~

These are **hand-authored models**, not recordings of live programs. Mathematical outputs are checked independently, while the checkout scenario makes no assertion about actual network delivery, physical causes of missing acknowledgements or payment-provider guarantees.

For the full explanations, questions and source evidence, see [reference traces](reference-traces.md). To create an example, see [reference authoring](authoring.md).
