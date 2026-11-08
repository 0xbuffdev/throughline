# Throughline release operations

Status: preparatory only. The source repository is private;
@0xbuff/throughline remains version 0.0.0 with private: true.
No npm package registration, staged submission, approval or publication
has been authorized. First planned functional release: v0.0.1.

## 1. Resolve source and legal rights

- Confirm legal ownership and redistribution rights for code, examples,
  tests, documentation and styles. The approved public-facing attribution
  is Copyright 2026 0xBUFF (COPYRIGHT.md) under Apache-2.0, but the brand
  and npm organization do not themselves prove chain of legal title.
- Review third-party sources, licensing and NOTICE obligations. Regex
  scans and installed dependency license checks are evidence, not a
  complete rights or security audit.
- Inspect the current tree, full Git history, packed artifact and all
  externally accessible references for sensitive material. A private
  planning reference survives in this repository's initial Git history.
  Read PUBLIC_SOURCE_HISTORY.md. Do NOT change visibility on this
  history-bearing repository.
- Separately authorize a clean public-source snapshot/cutover and
  audit the resulting public history, URL, CI, repository metadata and
  provenance before the functional package release.

## 2. Maintain quality gates

The only routine workflow is .github/workflows/ci.yml. The supported
local checks from Node 24 and pinned pnpm 11.2.2 are:

    pnpm install --frozen-lockfile
    pnpm audit:source
    pnpm typecheck
    pnpm test:run
    pnpm exec playwright install chromium
    pnpm test:browser:run
    pnpm build
    pnpm audit:licenses
    pnpm audit:pack
    pnpm audit:browser

These verify current source guards, deterministic compiler, browser
accessibility, tsdown exports/types, third-party license texts, packed
Node/TypeScript/SSR consumers and independent Vite/React hydration.

An offline pack and SHA-256 preview is not an npm publication or
provenance attestation. The one-time registry/registration/preflight
workflows and generators are retired after review to keep the source
repository focused. PR #10 preserves the historical candidate plan and
verification; any actual registration archive must be freshly generated
and independently inspected at the time of authorization.

## 3. Register npm package only after separate authorization

The maintainer verified owner membership in the npm 0xbuff organization
and configured 2FA. Recheck scope ownership, authenticated privileges,
package-name status and any staged versions when release is imminent.

npm supports first-package staged publishing, which creates a PUBLIC
0.0.0-stage placeholder even while candidate contents remain withheld.
This is an external write and must be separately authorized.

Proposed provenance-preserving workflow for functional v0.0.1:

1. Confirm rights and review a tiny isolated, nonfunctional 0.0.0
   registration candidate: manifest, explicit nonfunctional README,
   LICENSE and COPYRIGHT, no engine, dependencies or scripts. After
   explicit consent, stage it using current documented npm commands,
   without approving the nonfunctional staged version.
2. Configure an npm Trusted Publisher with stage-only privileges,
   exactly matched to the approved public GitHub repository, workflow
   filename and protected environment. No direct publish rights.
3. After the clean public-source cutover, separately approve a signed
   immutable v0.0.1 tag, reviewed manifest and exact tarball. All source,
   third-party and packed consumer checks must pass.
4. Add a protected stage-only GitHub workflow in a separate reviewed PR.
   Use a GitHub-hosted runner and OIDC id-token: write only for staging;
   do not embed long-lived npm tokens or auto-approve staged versions.
5. Review staged tarball, checksum, metadata, licenses and provenance.
   The maintainer approves functional v0.0.1 with npm 2FA, rejects the
   unused registration-only stage, then verifies the live package.

This is a plan, not permission to register, stage or publish. Check the
current official npm CLI and provider requirements before implementing it.

## 4. Post-release

Independently install the live registry package in Node and React 19
consumers. Migrate private integrations to a version-pinned release
through separate PRs; retire the duplicate incubated implementation.
Publish public API documentation and a changelog. Evolve package SemVer
independently from schema version 1.

Official references:
- https://docs.npmjs.com/staged-publishing/
- https://docs.npmjs.com/trusted-publishers/
- https://docs.npmjs.com/generating-provenance-statements/

No publication, public-source move, tag, version or visibility change
is authorized by these instructions or by passing CI.
