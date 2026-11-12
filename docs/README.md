# Throughline documentation

Start with the [README](../README.md) to install Throughline, compile a trace
and render it with the optional React player.

## Using Throughline

- [User guide](user-guide.md): player behavior, theme tokens, accessibility,
  navigation, narration, scenarios, Remark and MDX.
- [Flow grammar](grammar.md): source syntax, step operations, limits and
  diagnostics.
- [Domain catalog](catalog.md): flow, bindings, binary, matrix and callstack.
- [Framework integration](framework-integrations.md): Fumadocs, Next.js,
  Astro and other Markdown renderers.
- [Reference traces](reference-traces.md): reconciliation and distributed
  checkout examples.

## Development and releases

- [Architecture](architecture.md): compiler, trace model, presentation and
  trust boundaries.
- [Adapter authoring](authoring.md): building optional computed domains.
- [Release procedure](releasing.md): exact verification commands, signing,
  staged publication and post-release checks.
- [v0.1.0 release notes](release-notes-v0.1.0.md) and
  [migration guide](migration-v0.1.0.md).

For contributions and support, use [CONTRIBUTING.md](../CONTRIBUTING.md).
For private vulnerability reports, follow [SECURITY.md](../SECURITY.md).
The development-only [playground](../playground/) runs with `pnpm dev`.
