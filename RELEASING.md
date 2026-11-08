# Release playbook — Throughline

Status: **Preparatory only. No npm publication or visibility change authorized.**

The initial target is `@0xbuff/throughline@0.0.1` from
`https://github.com/0xbuffdev/throughline`. The independent engine is currently
a **private repository**, and its package remains `private: true` at version
`0.0.0`. The Apache-2.0 license is selected. These notes are operational
release gates, not an instruction to publish.

## 1. Complete rights and source review

- The requested project attribution is **Copyright 2026 0xBUFF**, recorded
  in `COPYRIGHT.md` and included in the npm package. Verify that the
  underlying legal person/entity has title or sufficient permissions to
  license every source, example, test, style and documentation component.
  A brand/trading name or npm organization does not independently acquire
  legal ownership of work.
- Verify copyright holder names, applicable years and any third-party material
  requiring retained attribution or an Apache-2.0 `NOTICE` file. Do not invent
  a NOTICE or imply Apache Software Foundation sponsorship.
- Review tracked source, commit history and the exact tarball for accidental
  secrets, commercial host code, private links, and licensing issues.
- A specific **historical private planning reference** remains in the initial
  extracted Git commit, even though current files were sanitized. See
  `PUBLIC_SOURCE_HISTORY.md`. Do **not** change this repository's visibility
  until a separately authorized clean-public-history cutover is verified.
  This is distinct from the nonfunctional npm registration candidate.
- Require passing TypeScript, compiler, real Chromium, tsdown, source/licensing,
  packed Node/SSR and independent Vite/hydration tests.
- Confirm the `@0xbuff` npm scope is controlled by the intended publisher.
  A similarly named GitHub organization does not prove npm scope ownership.

## 2. Review a build artifact without publishing

`.github/workflows/release-preview.yml` is a **read-only rehearsal**, not an
npm release workflow. It can run on its own PR or be dispatched manually after
merging. It has only `contents: read`; there is no `id-token: write`, npm
write credential, `npm publish`, tag, or repository visibility modification.

The rehearsal repeats current quality/consumer tests, runs `pnpm pack` and
uploads `throughline-preview.tgz`, `SHA256SUMS` and `ARTIFACT_INFO.txt`
for private review. The checksum identifies *that particular rehearsal
archive*. It is not a provenance attestation or proof of the future published
tarball's checksum. The workflow fails unless the source remains deliberately
unreleased (`private: true`, version `0.0.0`).

The separate source dependency-notice audit must pass on the candidate revision
before actual release. Do not use this rehearsal alone to declare readiness.

## 3. Register the package through staged publishing

**Updated November 8, 2026:** npm added new-package staged publishing on
October 2, 2026. A normal `npm publish` of an initial bootstrap version
is **not** required. `npm stage publish` can register a new package;
npm automatically creates a **public `0.0.0-stage` placeholder**
while holding the actual staged version and tarball for later review.
Creating that placeholder is an external public action and requires
separate authorization.

The preferred sequence to preserve provenance on functional `0.0.1`:

1. Confirm source redistribution rights, accurate copyright attribution,
   dependency notices, `@0xbuff` npm scope control, package status,
   account 2FA, and the exact archive. A public registry query cannot
   prove npm scope ownership, private/staged package absence or access.
2. After explicit approval, prepare an independently reviewed, minimal,
   **nonfunctional registration-only** candidate at version `0.0.0`,
   containing no private engine/source, secrets or third-party material.
   Stage it from an authenticated maintainer session with npm **11.15.0+**
   using `npm stage publish` and appropriate public scoped access.
   **Do not approve** this nonfunctional stage. The registry will create
   the publicly visible `0.0.0-stage` placeholder.
3. Configure the new package's Trusted Publisher to match GitHub owner
   `0xbuffdev`, repository `throughline`, workflow `publish.yml` and
   a protected `npm-publish` environment (if enabled). Grant
   **stage-only**, not direct publish or dist-tag permissions.
4. Once source rights, public GitHub visibility, an immutable reviewed
   signed tag and version `0.0.1` are separately approved, use the
   protected GitHub-hosted workflow with OIDC to stage the functional
   release with `npm stage publish` (never direct publish).
5. Independently review the staged tarball, manifest, provenance,
   Apache-2.0 notices, checksum and exact source revision. The
   maintainer must **approve** the functional stage using 2FA.
   Reject the unused nonfunctional registration stage and verify
   public installability and provenance.

An alternative is to stage the functional `0.0.1` as the very first
version from an authenticated session. That stage was not submitted
through a configured Trusted Publisher, so do **not** assume it
carries OIDC provenance. Staged versions reserve their version number;
do not assume the same version can be restaged.

Nothing has been registered, staged, approved or published.

## 4. Trusted release workflow requirements (not yet implemented)

The actual publish/stage workflow requires a **separate reviewed PR**
after rights, scope and registration review. The existing release
preview remains read-only and must not request OIDC permissions.

- Restrict execution to an explicitly approved signed `v0.0.1` tag
  matching the exact source revision and version.
- Require public GitHub source for npm provenance; private repositories
  cannot produce npm provenance even with Trusted Publishing.
- Use Node 24, npm CLI >=11.15.0, frozen installs and every source,
  third-party, compiler, React, hydration and packed-artifact check.
- Request `contents: read` and `id-token: write` only in the protected
  staging job; use GitHub-hosted runners and no long-lived npm token.
- Use only `npm stage publish` with stage-only trusted-publisher
  permission. Do not automatically approve a stage or allow direct
  `npm publish`. Require human review and npm 2FA approval.
- Configure the Trusted Publisher shortly before first use: its first
  successful publish must validate the binding within two days.
- Verify the approved live package metadata, runtime imports,
  integrity, published provenance and registry dist-tags.

Do not remove `private: true`, bump to `0.0.1`, stage/register any
package, create a release tag or change GitHub visibility without
specific release authorization.

## 5. Integrate and document the published package

After a real verified release, migrate private consumers to the version-pinned
package through separate PRs, retire the old incubated implementation as the
source of truth, and add released public API documentation to the separate
documentation repository. None of these steps is implied by green CI.

Official current references:

- https://github.blog/changelog/2026-10-02-npm-staged-publishing-now-supports-creating-new-packages/
- https://docs.npmjs.com/staged-publishing/
- https://docs.npmjs.com/cli/v11/commands/npm-stage/
- https://docs.npmjs.com/trusted-publishers/
- https://docs.npmjs.com/cli/v11/commands/npm-trust/
- https://docs.npmjs.com/generating-provenance-statements/
- https://www.apache.org/foundation/license-faq
