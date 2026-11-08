# Throughline grammar reference — `thl flow`

Source of truth for hand-authored traces. AI lesson authors write this;
`compile` parses and validates it into snapshots. A host can call this during
its build or at runtime.
Parameterized domains (`bindings`, `binary`, `matrix`, `callstack`) are
documented in `catalog.md`; they compile to this same grammar.

## Fence

    ```thl flow
    node input "Vector" in "Memory" as array = [1,2,3]
    step "Load"
      focus input
      note "Vector in memory"
    ```

- Info string names the domain: ```` ```thl flow ````.
- Everything between the fences is the program. Surrounding prose carries
  the concept; the fence carries only state and beats.
- Blank lines and `#` comment lines are ignored.

## Statements

| Statement | Syntax | Notes |
| --- | --- | --- |
| `group` | `group "<name>" as <row|column|tree>` | Arranges nodes sharing this group name; omitted groups use `row`. |
| `node` | `node <id> "<label>" [in "<lane>"] [as <view>] [hidden] [= <json>]` | Declares an entity. Missing value defaults to `null`. |
| `link` | `link <id> <from> -> <to> ["<label>"] [hidden]` | Declares a directed edge between two node ids. |
| `step` | `step "<label>"` | Opens a beat. Every `set`/`focus`/`send`/`note` after it belongs to it until the next `step`. |
| `set` | `set <target> = <json>` | Writes a JSON value into an entity or a position inside it. |
| `focus` | `focus [<target>, ...]` | Highlights entities/positions for this beat. Comma- or space-separated; may be empty. |
| `send` | `send <relation> [= <json>]` | Highlights a directed transfer along a link; payload appears in the caption. Value optional. |
| `note` | `note "<text>"` | Caption for this beat. |
| `show` / `hide` | `show node <id>` / `hide link <id>` | Changes persistent visibility; either verb accepts `node` or `link`. |

Groups, nodes, and links must come before the first `step`. Events before any
`step` fail the build.

## Targets and values

- Target: an entity id, optionally followed by positions: `arr`, `arr[3]`,
  `grid[1][2]`, `cfg.mode`. Writes to impossible paths (indexing a
  non-array, `.key` on a non-record, out-of-range index) fail the build
  at compile time. `focus` targets only need a known entity id — a
  position that never resolves simply never highlights. Arrays may grow
  by exactly one (`arr[len]` appends); records may gain keys.
- Value: finite JSON. Quote strings (`"emit"`); arrays and objects are
  supported. `NaN`/`Infinity` are rejected.
- Views (per node, `as <view>`): `auto`, `text`, `number`, `array`,
  `stack`, `matrix`, `bits`, `record`. Unknown views fail the build.
- Lanes (per node, `in "<lane>"`): free-form grouping string rendered as
  a group header (e.g. `"Memory"`, `"Output"`).

## Frames

Compilation emits frame 0 (`Initial state`, entity initial values) plus
one frame per `step`. Seeking is a snapshot lookup, never recompute.

- `set` updates the entity value for this and later frames; the beat's
  `changed` list carries the raw target strings (e.g. `input[1]`).
- `focus` and `set` targets together form the beat's `active` list.
- `send` adds a transfer for this beat only.
- `note` appends to the beat's caption lines.
- `show` / `hide` changes visibility for this and later frames. Hidden nodes
  retain their values and identities; links with hidden endpoints are omitted.
  Declare future objects with `hidden`, then show them when they appear.
  Conflicting visibility writes and transfers along hidden links or endpoints
  fail compilation. Changes within a step are applied together.

## Two staging rules (learned the hard way)

1. **One idea per beat.** Square *then* add; carry *then* land. Fusing
   two state changes into one step fuses their highlights and captions,
   and a same-value write (e.g. `1² = 1` over `1`) shows no change highlight — only
   the focus ring. Split beats stay legible.
2. **`send` does not mutate.** The edge highlights the transfer, but the
   destination keeps its old value until a `set` writes it. To show state
   sync, pair them across beats (`send feed = 4` on the Add beat, or a
   `Carry` beat with only `send` followed by a `Land` beat with `set`).

## Limits

200 entities, 1000 relations, 2000 steps, 10000 events per program.
Overlapping writes to the same target (or its parent/child path) inside
one step fail: split into separate steps.

## Errors (line-aware, fail the build)

    Line 2: Unknown view "sparkle". Use auto, text, number, array, stack, matrix, bits, record.
    Line 4: Invalid target "a..x". Use an id, optionally followed by [index] or .key.
    Line 5: Conflicting writes to "a[1]" in one step; split into separate steps.

`ProgramError` carries diagnostics with source lines where available.
Compiling a block throws on invalid syntax or state. A host build must invoke
the compiler to reject invalid content before publication; the Academy also
has a render-time error panel for malformed content.
