# Reference traces and comprehension baselines

Throughline's four first-party references are **schema-2 authored artifacts**.
They are teaching models, not executable source programs, telemetry or
scientific proof. Their canonical data and matched prose/questions live in
[src/reference](../src/reference) and are exported through
`@0xbuff/throughline/examples`.

All four pass the same strict artifact validator, deterministic replay compiler,
indexed history queries and source-preserving view projections. No domain-tag
router, network connection, AI provider or specialized matrix/stack renderer
is needed.

## How to read a reference

A reference pairs **one typed VisualArtifact** with a static explanation,
at least three comprehension questions, expected answers, exact supporting
event IDs and explicit caveats. The static explanation is a comparison baseline,
not a measured claim that the animated player improves learning outcomes.

All steps are *whole atomic commits*. A drawn link can express a declared
relationship, but it cannot write state or imply message delivery. Source IDs
connect visible items and history records to the exact authored evidence.
For a no-message reference, the sequence request falls back to an honest
state-table rather than fabricating messages.

| Reference | Truth anchor | Primary default view | Key source evidence |
| --- | --- | --- | --- |
| [Factorial](../src/reference/factorial.ts) | 4! = 24; stack depth rises to 4, then unwinds to 0 | Graph | `push1`, `return1`, `value2`, `value6`, `factorialResult` |
| [Matrix multiplication](../src/reference/matrix.ts) | [[1,2],[3,4]] × [[5,6],[7,8]] = [[19,22],[43,50]] | State table | `write00`, `write01`, `write10`, `write11` |
| [Binary addition](../src/reference/binary.ts) | 1011₂ + 0110₂ = 10001₂ = 17₁₀ | State table | `sumBit0`–`sumBit3`, `leadingCarry`, `decimalSum` |
| [Distributed checkout](../src/reference/checkout.ts) | Unknown worker outcome until an explicit reply; one charge **only under the fictional idempotent-provider assumption** | Sequence | `chargeFirstSent`, `providerCharged`, `workerTimeout`, `providerDedup`, `resultReceived`, `receiptPaid`, `orderPaid` |

### Factorial — what is actually modeled

The trace pushes factorial(4), factorial(3), factorial(2), then factorial(1).
The base case returns 1. Explicit return writes yield 2, then 6, then 24
while the modeled call stack empties. The maximum depth is four frames.
These are author-defined mathematical frames, **not observations of JavaScript,
Rust or a particular engine's physical stack**.

A matched question asks for the base-case return and points directly to
`return1`. Another asks for the final factorial value and cites
`value24` and `factorialResult`.

### Matrix — what is actually modeled

The left operand A is [[1,2],[3,4]] and the right operand B is
[[5,6],[7,8]]. Each of the four output cells receives an explicit
nested write after its row–column dot product has been authored.
The result is [[19,22],[43,50]]. Both inputs remain unchanged.
The references' `terms` state records pairwise products at each cell.

A matched question asks why C[0][0] equals 19 and cites `terms00`
and `write00`. No view performs matrix multiplication, and the zero
initialization is a teaching choice, not a runtime allocation claim.

### Binary — what is actually modeled

Unsigned 4-bit addends 1011 and 0110 are added from right to left.
Each step writes the corresponding bit and carry-out; a final event
writes the leading carry and decimal result. The full **5-bit** answer
is 10001, or 17. This is not signed arithmetic or a real-time hardware
simulation. The question on the first carry cites `sumBit1` and
`carryBit1`.

### Distributed checkout — what is actually modeled

A customer submits checkout. An order is explicitly saved as pending,
a payment job is queued/delivered, and the worker sends a charge.
The **fictional** provider is separately modeled as receiving and
processing that charge with one stored idempotency key.

The worker still has an **unknown** outcome because it has no modeled
reply. Its timeout is a state write, **not** proof of decline and **not**
proof that a specific packet was lost. A distinct retry message uses
the same idempotency key. The fictional provider's one-charge behavior
is an explicit assumption in the trace, not a guarantee about real
payment processors.

A later explicit reply send and receipt permits the worker's outcome to
become known. The local payment receipt and order do not become paid
until their separate writes, and the customer becomes confirmed only
after an explicit received notification. Each send, receipt, provider
processing event and persistence write has a separate evidence ID.

For example, the question *"Can the worker classify this payment as
declined after the timeout?"* has the expected answer *"No; the
outcome remains unknown"* and cites `workerTimeout`.

## Verify the artifacts independently

~~~ts
import { compileArtifact, inspectTrace, projectView, serializeArtifact } from "@0xbuff/throughline";
import { EXAMPLES } from "@0xbuff/throughline/examples";

for (const example of EXAMPLES) {
  const trace = compileArtifact(example.artifact);
  const history = inspectTrace(trace);
  const canonical = serializeArtifact(trace.artifact);
  const last = trace.frames.length - 1;
  const table = projectView(history, { kind: "state-table", frameIndex: last });
  console.log(example.id, trace.frames.length, table.summary, canonical.length);
}
~~~

The normative [truth tests](../src/__tests__/examples.test.ts) independently
check multiplication and addition math, factorial returns and stack depth,
checkout uncertainty, payment persistence order, source-event provenance,
deterministic canonical JSON and no fabricated events across views.

**What is not claimed:** human comprehension improvement, behavior of React
internals or real payment providers, missing network telemetry as proof of
packet loss, or a matrix/stack-specific renderer before its own review.
