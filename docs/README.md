# Documentation

Throughline's guides describe the **schema-2 v0.2.0 source candidate**. They are not evidence that v0.2.0 is available from npm. Confirm the installed version before following its API examples.

## Start here

| If you want to… | Read |
| --- | --- |
| See the purpose, installation requirements and first example | [Project README](../README.md) |
| Compile an artifact and use the optional player | [User guide](user-guide.md) |
| Write a `thl` Markdown block and understand the two supported input forms | [Authoring grammar](grammar.md) |
| Validate a document or work with reviewed prose sidecars | [CLI and editorial workflow](cli.md) |
| Integrate with Markdown, MDX and framework hosts | [Framework integrations](framework-integrations.md) |
| Learn from the four public model examples | [Reference catalog](catalog.md) and [worked explanations](reference-traces.md) |
| Upgrade a schema-1 integration | [Migrating from v0.1.x to v0.2.0](migration-v0.2.0.md) |

## For advanced users and contributors

- [Architecture](architecture.md) — how source becomes immutable frames, queries and visual projections.
- [Schema-2 semantics](schema-v2.md) — precise validation rules, events, provenance, limits and inspection.
- [Reference authoring](authoring.md) — how to add a truthful, testable teaching model.
- [Contributing](../CONTRIBUTING.md) — development tools, tests and pull request review.
- [Security policy](../SECURITY.md) — confidential vulnerability reporting.

## For maintainers

- [Changelog](../CHANGELOG.md) — release history and pending changes.
- [v0.2.0 candidate release notes](release-notes-v0.2.0.md) — upgrade impact and scope.
- [Release checks](release-quality.md) — automated evidence and manual accessibility boundaries.
- [Human screen-reader test record](qa/tl-u18-screen-reader-record.md) — unperformed until a real test is recorded.
- [Release procedure](releasing.md) — signed tags, staged npm approval and registry verification.

The [local playground](../playground/) is currently a **development reference preview**, not a production authoring environment or deployed service. Run it with `pnpm dev` from the repository.
