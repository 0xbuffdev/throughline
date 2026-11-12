# Reference traces

The public `EXAMPLES` export contains two hand-authored `thl flow` teaching
fixtures. They compile to version-1 traces; they do not execute React or a
payment service. The examples are deliberately small enough to inspect while
exercising connected state, transfers, visibility and backward seeking.

## Keyed React reconciliation

**Scenario:** An unordered list changes from children keyed `a, b` to
children keyed `a, c`. Both roots are the same `ul` element type.

1. Compare the roots before revealing any child-match link.
2. In the `Reuse key a` step, reveal the match for child `a` (same parent,
   stable key and compatible element type).
3. Retain `a`, plan removal of `b`, and prepare insertion of `c` in
   the temporary work-in-progress illustration. The current tree remains
   unchanged while the changes are planned.
4. At commit, hide old `b`, retire the temporary work-in-progress nodes and
   links, and show committed `c`. The retained `a` is not replaced.

**Identity representation:** `added` denotes the proposed child in the
temporary work-in-progress view; `committedC` denotes that same logical
key `c` after it becomes a current-tree child. They are **illustrative
phase-specific nodes**, not two simultaneously mounted React children or
a claim about internal Fiber identity. The commit removes the WIP view
altogether, leaving just current `a`, committed `c`, their root and the
commit plan. The `a` entity retains its identity and value.

**Accuracy boundary:** This is a simplified keyed-children explanation,
not a complete simulation of React Fiber or an assertion about its
scheduler. Matching a key alone does not guarantee reuse if the parent
or element type changes. See [React's list key guidance](https://react.dev/learn/rendering-lists)
and [state preservation guidance](https://react.dev/learn/preserving-and-resetting-state).

### Questions and expected explanations

| Question | Expected explanation |
| --- | --- |
| What makes key `a` eligible for reuse? | Its key, parent and element type match in this example. |
| When is the old `b` removed? | In the commit beat, not while preparing the work-in-progress plan. |
| Is the new `c` already in the current tree during planning? | No. It is first shown as work in progress and later as a committed child. |
| Why do the two phases use different node IDs for `c`? | They represent one logical keyed child at different points in the illustration. The WIP representation is retired when the committed representation appears. |

## Distributed checkout: timeout, retry and recovery

**Scenario:** The checkout API persists a pending order and queues a
payment attempt. The provider supports idempotency for the stable
`pay-ord-1042` key. The provider records the first charge, but its
acknowledgement is lost. The worker times out without knowing the result,
resends using the same key, receives the prior result and only then
persists payment confirmation, marks the order paid and notifies the
customer.

The fixture deliberately distinguishes four things:

- `send` only annotates a directed message/command; a matching `set`
  models separately observed persistence.
- A request timeout gives the **worker an unknown outcome**, not proof
  that the provider failed or succeeded.
- A repeated idempotency key is safe in **this authored provider scenario**.
  It is not a promise that arbitrary payment providers deduplicate requests.
- The local payment record, order state and customer-facing status advance
  only at their explicit confirmation steps.

### Questions and expected explanations

| Question | Expected explanation |
| --- | --- |
| Is the order already saved when the checkout request arrives? | No; the `Persist pending order` beat first records it. |
| Is the provider confirmed to have charged when the worker first sends a request? | No; sending does not persist the provider state. |
| What can the worker conclude from the timeout? | The outcome is unknown; payment must not be marked failed or paid solely from timeout. |
| Why is there one charge after retry? | The scenario explicitly assumes a provider that deduplicates the repeated idempotency key. |
| When does the customer see success? | After the worker receives confirmation, records payment, updates the order and reports recovery. |

## Evidence and compatibility boundaries

At the observed **v0.0.2** implementation baseline:

- `validateProgram` accepts JSON values nested through depth **32**
  (starting at the value itself) and rejects depth **33**.
  `createBudget` has a separate maximum traversal depth of **64**.
  The validator is the effective smaller ceiling for program values;
  a budget accounting limit is **not** a promise that depth-64 program
  values are valid. Regression tests pin both behaviors independently.
- `validateProgram` rejects unsupported `Program.version`; compilation
  emits `Trace.version = 1`.
- **Reader compatibility boundary:** `ThroughlinePlayer` rejects unsupported `Trace.version` and missing `frames` arrays before reading playback state. This does not completely validate arbitrary untrusted, serialized snapshot content; the host must validate externally supplied trace data.

The test suites cover deterministic compilation, seeking, relation endpoints
and browser-player rendering.

## Changes since v0.0.2

The v0.0.2 player used flat layouts without nested collapse, pan/zoom,
follow-active navigation or scene projection. Version 0.1.0 adds those
presentation features while keeping the trace schema at version 1.

These teaching questions are examples for comprehension testing, not
measured participant-study results.
