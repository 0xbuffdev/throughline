# Throughline adapter catalog

Computed domains turn terse params into micro-step Programs. Each adapter
is `parse(ast) → params`, `build(params) → Program` (via `tracer()`),
routed by the fence domain in `compile`. Hand-authored traces stay on
`flow` (`grammar.md`); adapters exist only where humans should not
hand-write the steps.

## flow (hand-authored)

Core grammar: `node`, `link`, `step`, `set`, `focus`,
`send`, `note`, `show`, `hide`. The fallback for every domain without a computed
adapter — workflows, protocols, pipelines, git/CI, threat models.
See `grammar.md`. No limits beyond the engine caps (200 entities,
1000 relations, 2000 steps, 10000 events).

## bindings — variable slots, primitives vs references

    ```thl bindings
    let a = 5
    let b = a
    b = 9
    const list = [1, 2]
    const alias = list
    alias.push(3)
    alias = [7]
    ```

- Statements: `let`/`const <name> = <json|name>`, `<name> = <json|name>`,
  `<name>.push(<json>, …)`. One source line = one beat.
- Emits: a `Stack` lane (one slot per variable, `null` until declared)
  plus a `Heap` lane (`o1`, `o2`, … per array/object literal). Copying a
  reference sends a packet along a `var → heap` edge; pushing focuses
  every variable sharing the object so the sync is visible.
- Limits: `const` is not enforced; no expressions, indexing, or methods
  besides `push`; push targets arrays only. Future variables and heap objects
  start hidden. Only current reference edges are visible; rebinding hides
  the previous edge while retaining the heap object for other aliases.

## binary — ripple-carry addition

    ```thl binary
    a = 1011
    b = 0110
    ```

- Params: `a = <bits>`, `b = <bits>` (order free). Operands are 1–16
  binary digits.
- Emits: `A`/`B` as `bits` nodes, a `Sum` row (MSB-first with a leading
  carry-out slot, `·` placeholders), a `Carry` number. One beat per bit,
  LSB first (`bit 0` …), then a `Result` beat: carries ripple visibly
  because each beat sets its sum cell and the carry together.
- Limits: 16 bits; unsigned only. Final result is always width n+1
  (leading zero when there is no carry-out).

## matrix — matrix multiplication

    ```thl matrix
    A = [[1,2],[3,4]]
    B = [[5,6],[7,8]]
    ```

- Params: `A = <grid>`, `B = <grid>` (order free). Grids are 1–4 rows of
  1–4 finite numbers, all rows equal length, inner dimensions matching.
- Emits: `A`, `B`, `C` as `matrix` nodes (`C` starts as `·`), a `Terms`
  work row, and `row`/`col` read edges. One beat per output cell in
  row-major order: focuses the A row and B column cells, writes
  `C[i][j]`, lands the pairwise products in `Terms`, and sends both
  reads as packets. Notes carry the full `C[i][j] = t0 + t1 = total`
  expansion.
- Limits: 4×4. No transpose/inverse/determinant — `flow` covers the rest.

## callstack — factorial recursion

    ```thl callstack
    fact 4
    ```

- Params: one line, `fact <n>`, depth 1–6.
- Emits: `slot1…slotN` frame slots (`Call stack` lane, bottom-up) plus a
  `Returns` row. Push beats run `fact(n)` down to `fact(1)` (`calls`
  packets travel caller → callee); unwind beats pop each frame to `null`,
  record its value, and send a `↩` packet; a final `done` beat lands the
  total. Notes narrate the blocked-on / got-back arithmetic.
- Limits: factorial only, depth ≤ 6 (13 beats max). General calls,
  branches, and prediction are future adapters.

## Planned (tier 2, lesson-on-demand)

Each is one `parse` + one `build()` on `tracer()`, ~100 lines with
tests — transcription of the `visualizer/` reference computations, never
bespoke SVG: `vectors` (dot-product geometry, SEF6), `gradient`
(descent + finite-difference compare, SEF6/AI3), `search` (binary
search, SEF3), `sort` (bubble/insertion, SEF3), `cache`/`race`/`tcp`
(SYS1–SYS4 simulators). Workflows never need adapters: `flow` + the
grammar covers them.
