# Throughline documentation

The [repository README](../README.md) covers installation, exports, a quick
start and the local visual playground. The files below distinguish published
behavior from features present only in the v0.1.0 source candidate.

## Authoring and integration

- [Grammar](grammar.md): hand-authored `thl flow` and validation limits.
- [Domain catalog](catalog.md): the five supported domains.
- [Adapter authoring](authoring.md): guidance for extending computed domains.
- [Architecture](architecture.md): compiler, projection, optional React player and trust boundaries.
- [Reference traces](reference-traces.md): example semantics and version boundaries.
- [Framework integrations](framework-integrations.md): source-candidate Remark/MDX and host integration; **not currently published v0.0.2 instructions**.

## Release evidence (not authorization)

- [v0.1.0 readiness](release-readiness-v0.1.0.md): automation, outstanding acceptance criteria and release/rollback plan.
- [Hardening](release-hardening.md): verification map, source safety and manual gates.
- [Post-v0.0.2 QA](release-qa-post-v0.0.2.md): historical pre-fix assessment and the later WebKit fix.

Support, contribution and the maintainer's signed-tag/staged-release procedure
are consolidated in [CONTRIBUTING.md](../CONTRIBUTING.md).
Report vulnerabilities via [SECURITY.md](../SECURITY.md).
The source-backed [playground](../playground/) remains available through
`pnpm dev` and is excluded from the npm package archive.
