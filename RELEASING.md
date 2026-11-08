# Release playbook — Throughline

Status: **Preparatory only. No npm publication or visibility change authorized.**

The initial target is `@0xbuff/throughline@0.0.1` from
`https://github.com/0xbuffdev/throughline`. The independent engine is currently
a **private repository**, and its package remains `private: true` at version
`0.0.0`. The Apache-2.0 license is selected. These notes are operational
release gates, not an instruction to publish.

## 1. Complete rights and source review

- Confirm who legally holds the copyright for the source, examples, tests,
  styles and documentation; verify ownership/permission for each extracted
  component. Do not infer ownership from GitHub organization membership.
- Verify copyright holder names, applicable years and any third-party material
  requiring retained attribution or an Apache-2.0 `NOTICE` file. Do not invent
  a NOTICE or imply Apache Software Foundation sponsorship.
- Review tracked source, commit history and the exact tarball for accidental
  secrets, commercial host code, private links, and licensing issues.
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

## 3. Decide npm first-publication bootstrap

**Important:** npm requires an existing registry package before configuring a
Trusted Publisher. A previously unused `@0xbuff/throughline` name cannot
normally receive its *first* publication via the later OIDC Trusted Publisher
configuration. Verify registry scope/name availability and current npm policy
before choosing an approach.

Two possible plans require a separate explicit approval:

1. **Provenance-first functional release (preferred if `0.0.1` must have
   provenance):** after public-source/rights clearance, register an explicitly
   labelled, nonfunctional bootstrap package as `@0xbuff/throughline@0.0.0`
   using an authorized one-time interactive npm publication, under a non-latest
   dist-tag (e.g. `bootstrap`). Review exactly what the bootstrap archive ships;
   do **not** silently publish the current engine as a placeholder. Then configure
   the npm Trusted Publisher and release functional `0.0.1` by the approved OIDC
   workflow with provenance.
2. **No-placeholder initial release:** publish the functional `0.0.1`
   interactively after approval. Configure Trusted Publishing for later
   versions. The initial release then lacks OIDC-generated provenance; disclose
   that tradeoff rather than claiming an attestation.

Neither plan is executed by this repository's current automation. Never put a
persistent npm publish token in a source file, GitHub log, or release script.

## 4. Configure the eventual trusted-release path

After the package exists on npm and **while the planned publication is
imminent**, create the npm Trusted Publisher binding for the exact owner
`0xbuffdev`, repository `throughline`, workflow filename (for example
`publish.yml`), and optional protected environment (for example
`npm-publish`). Verify the current npm UI and policy at that time; a newly
created binding may expire if not first used successfully within two days.

Prepare a **separate reviewed PR** for the real publishing workflow:

- Start only from a maintainer-approved immutable signed `v0.0.1` release tag
  matching the package version and the exact reviewed commit.
- Require the source repository to be public for npm provenance, and publish
  under `--access public` using npm CLI `>=11.5.1` on a GitHub-hosted runner.
- Use `contents: read` and, only for the publishing job, `id-token: write`;
  avoid long-lived npm tokens. Apply appropriate environment and tag protections.
- Choose staged publication with explicit maintainer approval if supported by
  the configured npm account/publisher permissions; direct `npm publish`
  requires separate authorization.
- Verify a clean frozen install, tests, the exact packed contents and license,
  source commit, dist-tag and checksum before external publication.
- Confirm published metadata, installability and provenance on npm afterwards.

Do not set `private: false`, bump to `0.0.1`, create a release tag, or
introduce a publishing command until the rights, scope, staging and public
source gates have been separately reviewed.

## 5. Integrate and document the published package

After a real verified release, migrate private consumers to the version-pinned
package through separate PRs, retire the old incubated implementation as the
source of truth, and add released public API documentation to the separate
documentation repository. None of these steps is implied by green CI.

Official current references:

- https://docs.npmjs.com/trusted-publishers/
- https://docs.npmjs.com/cli/v11/commands/npm-trust/
- https://docs.npmjs.com/generating-provenance-statements/
- https://www.apache.org/foundation/license-faq
