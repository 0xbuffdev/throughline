# Throughline v0.2.0 — Release candidate

**Not published.** This describes the proposed v0.2.0 source. A green PR or updated package version is not an npm release. Human screen-reader testing, maintainer approval, signed tagging, protected npm staging, npm 2FA and independent registry verification are still required.

## What's new

Throughline now uses a **single, domain-independent data model** to show how authored state changes over time. Instead of choosing a domain-specific parser, authors declare a schema-2 `VisualArtifact` containing explicit entities, relationships, known/unknown values and events.

The engine validates those facts and compiles immutable state snapshots. Pure inspection APIs expose value history, changes and source evidence. Graph, Sequence and State-table views provide different presentations of the same model, with an optional responsive React player and Explain/Inspect controls.

Markdown and MDX use one plain `thl` fence. Strict JSON works offline. Descriptive text can only be used with a separately authored, human-reviewed artifact whose source and content hashes match an approved manifest entry. The `thl` CLI helps prepare and check those manifests; it cannot generate or approve a model.

Four checked examples demonstrate factorial recursion, 2×2 matrix multiplication, unsigned binary addition and a hypothetical distributed checkout retry. The checkout is a simulation, not a claim about a payment provider.

The package ships six explicit ESM/CSS entry points, a Node 24+ command, and optional React 19 peers. It does not require an account, runtime network service or AI provider.

## Breaking changes

This is **not** a drop-in upgrade from v0.1.x. The old schema-1 `Program`/`Trace` APIs, domain-tagged fences, domain-specific compiler exports, `ThroughlinePlayer` and old MDX source prop are not supported in v0.2.0. Migrate to schema-2 `VisualArtifact`, `compileArtifact`, `ThroughlineGraphPlayer` and the literal `artifactJson` bridge. Existing source needs to be remodeled, not simply renamed.

Read the [migration guide](migration-v0.2.0.md) before upgrading. The package version `0.2.0` and `VisualArtifact.schemaVersion: 2` are independent versioning schemes.

## What this release does not do

Throughline does not execute a described algorithm or automatically infer facts from prose. Messages do not imply writes or acknowledgements. An event origin or reviewed claim is not independent scientific evidence. Additional higher-fidelity authoring/visual tools, automatic AI providers, published learning-outcome studies and the live docs-application migration are **outside this candidate**.

The repository's Vite playground is currently a **development reference preview**, not a public production authoring service.

## Publication requirements

The exact candidate package must undergo recorded real screen-reader interaction with source-commit and archive SHA-256 evidence; manual zoom and audio review remain distinct. Maintainers must approve the source, verify rights and license notices, review browser and packed-consumer tests, authorize a GitHub-verified signed tag, and inspect the protected stage-only OIDC package. Final publication is performed through independent human npm 2FA approval. Registry availability is established only after actual package digest, provenance, CLI and clean-consumer verification.

See [release quality](release-quality.md), [the human test record](qa/tl-u18-screen-reader-record.md), and [the release runbook](releasing.md) for precise evidence and commands. Do not announce v0.2.0 as published until those gates are complete.
