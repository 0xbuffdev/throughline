# Throughline v0.2.0 — Schema-2 source release candidate

**Status: NOT PUBLISHED.** This document describes the reviewed candidate that TL-U19 is preparing, not an npm release announcement. Publication requires real TL-U18 screen-reader evidence, maintainer authorization, a verified signed tag, a protected GitHub OIDC staging job, independent review of the staged archive, and human npm 2FA approval. The package currently available on npm may still be v0.1.0.

## What changes in 0.2.0

Throughline moves from domain-specific visualization programs to a universal, strictly validated, deterministic schema-2 artifact model. The public source now implements a separate semantic compiler, immutable frames, indexed queries, text-equivalent projections, safe Markdown authoring, an accessible optional React 19 player, and a standalone offline Node CLI.

- **One `thl` authoring surface:** an unqualified Markdown/MDX fence containing strict `VisualArtifact` JSON compiles offline. Descriptive prose is inert until a human reviews a canonical schema-2 materialization whose source and artifact hashes match an approved sidecar. No runtime network requests, AI calls, automatic approval or inferred diagram are part of core compilation.
- **Semantic truth and inspection:** original source IDs, origin declarations, explicit writes/topology/messages/observations, known/unknown/absent state, causal citation boundaries and atomic steps. No invented message phases or persistence.
- **Pure Graph, Sequence and State-table projections**, plus Explain/Inspect and optional audio in the native React player. Native rendering is responsive and has automated keyboard/semantic browser coverage.
- **Four checked references:** factorial recursion, 2×2 matrix multiplication, 4-bit binary addition and a hypothetical distributed checkout/retry, each with a static explanation, comprehension questions and explicit evidence limitations.
- **Node CLI and trusted host:** `thl validate`, `thl materialize`, `thl check` and a root-confined Node filesystem adapter; no automatic content approval.
- **Package boundaries:** the package root does not require React or Node filesystem APIs. Optional peers `react` and `react-dom` are React 19; Node 24+ and ESM are required.

## Intentional breaking changes

**No backward compatibility is provided.** Existing users must migrate their inputs before installing v0.2.0.

| Previous v0.1.x surface | v0.2.0 source contract |
| --- | --- |
| Domain-tagged fences such as `thl flow`, `thl binary`, `thl matrix`, `thl callstack` | Plain `thl` with strict schema-2 JSON or reviewed prose |
| v1 Program / Trace schema | `VisualArtifact.schemaVersion: 2`, compiled via `compileArtifact` |
| Public `compile`, `compileProgram`, domain router | `validateArtifact`, `compileArtifact`, `inspectTrace`, `projectView`, `projectInspection` |
| Previous `ThroughlinePlayer` | `ThroughlineGraphPlayer` / `ThroughlineEmbed` with `artifactJson` |
| Domain-dependent inferred visuals | Explicit modeled evidence and truthful fallbacks |

The *npm version* `0.2.0` is not the *artifact schema version* `2`. They version different contracts.

## Public entry points

| Import | Purpose |
| --- | --- |
| `@0xbuff/throughline` | Pure validation, compilation, inspection, projection, hashes and authoring |
| `@0xbuff/throughline/remark` | Host-independent Markdown/MDX transform |
| `@0xbuff/throughline/node` | Trusted Node filesystem authoring host |
| `@0xbuff/throughline/react` | Optional React player/embed |
| `@0xbuff/throughline/examples` | Four frozen-reference metadata entries with fresh artifact copies |
| `@0xbuff/throughline/styles/throughline.css` | Explicitly imported namespaced stylesheet |

The separate `thl` executable is published through `bin`, not as an extra package export.

## Verification required before announcing availability

1. **TL-U18:** Actual screen-reader interaction in a tested, independently packed candidate; timestamp, operator, browser/OS/AT versions, heard announcements, original source SHA, tarball SHA-256, deviations and human acceptance recorded. The placeholder template in `docs/qa/tl-u18-screen-reader-record.md` is **NOT PERFORMED**, not evidence. Native 200%/400% zoom and sound checks are additional release approvals.
2. **Source candidate:** Typecheck, frozen dependency install, malicious JSON/security suite, deterministic performance and trace checks, Chromium/Firefox/WebKit, SSR/hydration, mobile embed, source/license/third-party notices and independent Node/Remark/React/Fumadocs/Next.js/Astro packed consumers. Preserve exact-source CI artifacts and the approved source SHA.
3. **Signed release:** `v0.2.0` is an immutable, GitHub-verified signed annotated tag of the final reviewed `main` commit. Do not create or push it until separately authorized.
4. **Stage-only release:** The protected `npm-publish` environment checks an authentic maintainer's real AT acceptance comment matching **that exact commit and staged archive SHA-256**. The action builds, audits and uploads the candidate, then uses GitHub OIDC for `npm stage publish`, not `npm publish`. A stage is not a published version.
5. **Human npm approval:** Review the exact stage ID and package bytes, then approve separately with npm 2FA. This authorization is not implicit in merging the source PR.
6. **Registry verification:** Compare the published tarball's SHA-256 with the immutable GitHub stage manifest and the registry's SHA-1/SHA-512; require registry attestation metadata, run `npm audit signatures` in a fresh consumer, inspect the public provenance workflow/source commit, and test `thl`, Node-only and optional React imports from the **registry** version. Retain evidence in the TL-U19 release review.

Read [the step-by-step release procedure](releasing.md) for the exact commands and the [release-quality evidence](release-quality.md) for the prior TL-U18 automation and manual boundary.

## Deliberate non-goals

The current v0.2.0 candidate does not include the additional visual composition and authoring fidelity proposed under TL-U21–TL-U24, an automatic AI resolver (TL-U12), or a published comparison study (TL-U25). Real documentation-application upgrades are deliberately separate in **TL-U20**, after successful registry publication. No measurable improvement in learning effectiveness is claimed.
