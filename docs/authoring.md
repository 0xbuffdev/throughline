# Throughline adapter authoring guide

How to add a computed domain. Copy `binary.ts` (simplest) or
`bindings.ts` (dynamic topology on static edges); keep the adapter
~100 lines plus tests.

## Recipe

1. **Syntax.** Define 2–5 lines of params in the fence body, e.g.
   `a = 1011`. Iterate them with `sourceLines(ast)` (blank lines and `#`
   comments skipped without shifting the original fence-relative numbers).
2. **Parse: `parseX(ast: ThlBlock): Params`.** Validate everything and throw
   `ProgramError([{ message, line }])` — these fail the build with the
   same rendering as grammar errors. Parse never computes.
3. **Build: `buildX(params: Params): Program`.** Run the ordinary
   algorithm and narrate it with `tracer()`: `node`/`link` declarations
   first, then one `step(label, body)` per micro-step using
   `set`/`focus`/`send`/`note`. Use `group(name, "row" | "column" | "tree")`
   to arrange a set of nodes. `tracer().get()` reads live state
   between steps. Validate by compiling: `compileProgram` enforces
   unknown targets, conflicting writes, and value shapes.
4. **Register.** Add the name to `DomainName` (`domains/types.ts`),
   `SUPPORTED_DOMAINS`, and the `COMPUTED` dispatch table
   (`domains/registry.ts`), all re-exported from the package index.
5. **Document.** Add a catalog entry: syntax, params, exactly which
   micro-steps it emits, a minimal example, and its limits.

## Staging rules

The two staging rules live in `grammar.md` (one idea per beat;
`send` does not mutate) and bind computed adapters too. Two
adapter-specific additions:
- **Stable identities, changing visibility.** Predeclare nodes and links;
  future objects and inactive references start with `hidden: true`.
  Use `show("node", id)` / `hide("node", id)` and their `"link"` equivalents
  to describe the current structure. Rebinding hides the previous reference
  and shows its replacement in one step. A transfer cannot use a hidden link
  or endpoint. Reserving layout space does not require showing future objects.
- **One source line = one beat** where the domain has source lines
  (`bindings`); otherwise one computation step = one beat (`binary`
  bits, `matrix` cells, `callstack` pushes/pops).

## Tests (same change, no exceptions)

- Parse: happy path plus every error branch (missing/duplicate/bad
  operand, out-of-range) asserting the `/Line N/` message.
- Build: beat labels in order, final entity values, at least one
  transfer assertion, and one failure/edge case (zero carry, rebind,
  1×1 grid, depth 1).
- Registry: one routing test per domain in `__tests__/registry.test.ts`.
- Run `pnpm --filter @0xbuff/throughline test:run` and `typecheck`;
  both green before commit. No `describe.only`/`test.skip` — CI
  forbids them.
