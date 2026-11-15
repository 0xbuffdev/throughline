# Releasing Throughline

The package is distributed as [@0xbuff/throughline](https://www.npmjs.com/package/@0xbuff/throughline).
Each version is published from an immutable, GitHub-verified signed
`vX.Y.Z` tag using manual GitHub Actions OIDC staged publishing.
**The GitHub workflow only stages a release; npm 2FA approval publishes it.**

## Verification

Use Node.js 24+, pnpm 11.2.2 and the committed lockfile. The protected
staging job pins npm CLI 11.21.2, which satisfies npm's documented
11.15.0-or-later staged-publishing requirement. Run the full
release suite on the exact reviewed revision:

~~~sh
pnpm install --frozen-lockfile
pnpm audit:source
pnpm typecheck
pnpm test:cli
pnpm preview:typecheck
pnpm preview:build
pnpm test:run
# CI additionally validates SHA-bound TL-U18 JSON performance/security evidence.
pnpm test:release-performance
pnpm test:release-security
pnpm exec playwright install chromium
pnpm test:browser:run
pnpm build
pnpm audit:licenses
pnpm audit:pack
pnpm audit:browser
pnpm audit:frameworks
pnpm audit:markdown-hosts
~~~

Inspect the [release-quality evidence and manual accessibility checklist](release-quality.md) before authorizing a package release. Exact-head CI checks `v2-performance.json` and `v2-security.json`, and attaches them as GitHub Actions artifacts alongside Chromium, Firefox and WebKit browser evidence. The performance numbers are measured baselines, **not** unreviewed latency SLAs. **Real screen-reader acceptance on a source- and tarball-SHA-bound candidate must be performed before TL-U18 can be closed.** Follow the [actual AT test-record instructions](qa/tl-u18-screen-reader-record.md); the current record is NOT PERFORMED. Real native-browser zoom and other device checks must be reported as performed or outstanding for the TL-U19 release review, never silently passed.

For Firefox and WebKit verification, install the browser binaries and run
`THROUGHLINE_QA_BROWSER=firefox pnpm test:browser:run` and
`THROUGHLINE_QA_BROWSER=webkit pnpm test:browser:run`. Verify the final CI
results and the packed tarball, not just a successful TypeScript build.

Validate browser/device appearance, keyboard and screen-reader interactions,
200%/400% zoom, reduced motion and opt-in speech/sound on the supported
platforms. Maintain recorded acceptance evidence for any release-specific
performance, comprehension or documentation-application integration
requirements. These checks are not replaced by mocked or fixture-only tests.

## TL-U19 candidate preparation (source PR; not publication)

The initial schema-2 candidate is **0.2.0**. Preparing and merging a versioned source PR does **not** imply permission to sign a tag, start a staging run, approve a release, or deploy the docs app. See [draft release notes](release-notes-v0.2.0.md).

The source PR must keep all six public exports and the `thl` binary, exact source-dependent CI, the frozen lockfile and the checked independent packed consumer matrix. It also adds `pnpm test:release-tooling` for denial-path checks. The separately packed `v0.2.0` version is a **candidate** until npm confirms the publication.

Before *any* tag or stage run, the outstanding TL-U18 human screen-reader acceptance must be completed on a **real screen reader against the exact candidate tarball**; record a dated, source-SHA and archive-SHA-bound test and resolve blocking findings. The unperformed template is not a pass. Also review actual native browser 200%/400% zoom, optional audio, rights, independent packed hosts, warnings and release notes.

### Record and validate the exact candidate for approval

After the **reviewed source PR is merged**, use a clean checkout of the intended `main` commit. The same `pnpm pack` archive must be installed into the manual acceptance app. The candidate may be recreated from the approved tag during the staged workflow; a different digest requires a new human evidence review.

~~~sh
git switch main
git pull --ff-only
git rev-parse HEAD
pnpm install --frozen-lockfile
pnpm test:release-tooling
pnpm build
mkdir -p release-artifacts
pnpm pack --out release-artifacts/throughline.tgz
(cd release-artifacts && sha256sum throughline.tgz > SHA256SUMS)
git rev-parse HEAD > release-artifacts/RELEASE_COMMIT
THL_SOURCE_SHA="$(git rev-parse HEAD)" THL_RELEASE_TAG=v0.2.0 \
  node scripts/release-artifact.mjs create release-artifacts
~~~

As an additional distribution proof, the normal read-only GitHub CI now **packs this candidate twice**: once on the exact source head (with `throughline-v2-candidate-<run-id>` as a downloadable archive containing the tarball, SHA256SUMS, RELEASE_COMMIT and RELEASE_MANIFEST.json) and once for the proposed merge commit. After the reviewed release PR merges, use the **latest main CI** candidate artifact for the final human test, rather than reusing a superseded PR-head build. Verify that its `RELEASE_COMMIT` equals the intended final main SHA and that both archive checksums match. CI packaging is unsigned and **does not** stage or publish to npm.

The reviewed human test **must** use that archive, including the optional React 19 host, and the record must include the actual spoken announcements, tester, OS/browser/AT versions, results, deviations, full commit SHA and SHA-256. Do not put human transcripts or identifiers into public source by default without a privacy review; reference a reviewed PR issue/comment or a consented QA attachment.

A maintainer who has actually examined the evidence must create a **GitHub issue comment in this repository** (on a suitable repository PR or issue) with exactly these lines (replace every placeholder with actual values; do **not** paste this template as approval):

~~~text
TL-U18-AT-ACCEPTED
source-sha: <full 40-character main commit SHA>
tarball-sha256: <64-character reviewed archive SHA-256>
tested-on: <YYYY-MM-DD>
screen-reader: <actual AT name and version>
browser-os: <actual browser and OS versions>
record-url: https://github.com/0xbuffdev/throughline/pull/<number>#issuecomment-<actual-record-comment-id>
result: pass
~~~

The comment must be authored by a real GitHub repository OWNER/MEMBER/COLLABORATOR. Its **numeric GitHub issue-comment ID** is entered into the release workflow as `acceptance_comment_id`. The workflow checks the comment's human authorship, repo, exact source SHA, staged tarball SHA-256, date, AT/browser information and a real evidence link. If the original record changes or its source/archive differs, staging fails. A validly formatted comment is a *reviewed human assertion*, not proof that a machine listened to a screen reader: the protected `npm-publish` environment approver must inspect the linked manual evidence independently.

**If no actual AT test has occurred, do not create the approval comment or start the release workflow.** The GitHub acceptance and protected-environment approvals are distinct from npm's final 2FA approval.

## Release checklist

1. Verify rights to distribute the source, applicable third-party notices,
   security reporting, release acceptance, compatibility and the final
   changelog. Review the public history for any sensitive references.
   Historical exposure cannot be undone by deleting current-tree files.
2. Update the version in `package.json` and document the changes in
   `CHANGELOG.md`. Maintain the six public package exports and the separate `thl` binary;
   schema-2 `VisualArtifact.schemaVersion` is independent of npm SemVer.
3. Run the source, TypeScript, preview, Chromium/Firefox/WebKit browser,
   build, license and packed consumer checks listed above.
   Record the exact candidate SHA, CI runs, quality evidence artifacts and actual manual accessibility/rights review.
   Review and merge the source PR only after maintainer approval and green
   source/merge CI. Then inspect the final main-CI candidate, run the real
   manual screen-reader acceptance on those exact bytes, and record the
   source- and archive-bound human approval comment before tagging.
4. From a clean checkout with a signing key registered with GitHub, create
   and push an immutable signed tag **only after** the release commit is
   merged. For the proposed schema-2 version `0.2.0` (only if approved):

   ~~~sh
   git switch main
   git pull --ff-only
   git tag -s v0.2.0 -m "Throughline v0.2.0"
   git tag -v v0.2.0
   git push origin v0.2.0
   ~~~

   GitHub must show the tag as **Verified**. Protect `v*` tag updates and
   deletions. Do not move or reuse existing release tags.
5. In [GitHub Actions](https://github.com/0xbuffdev/throughline/actions),
   run **Throughline npm release (staged with provenance)** from `main`.
   Enter the exact signed tag (e.g. `v0.2.0`), confirmation
   `STAGE-v0.2.0` and the actual `acceptance_comment_id`.
   The read-only verification job checks that the signed tag matches the
   **current main HEAD**, that the version is not already public, that
   source/tests/packed consumers pass, and that the human acceptance
   comment is from a maintainer and matches the **exact source and
   archive**. It uploads a `RELEASE_MANIFEST.json` plus the immutable
   tarball and checksums; the protected staging job re-fetches the human
   comment and verifies the same archive again. Any mismatch fails closed.
6. Inspect the GitHub release artifact and approve the protected
   `npm-publish` environment job. Its **stage-only** Trusted Publisher
   uses GitHub-hosted OIDC and npm provenance, without an npm token or a
   direct `npm publish`. The npm connection must match GitHub
   `0xbuffdev/throughline`, workflow filename `publish.yml`,
   environment `npm-publish`; direct publishing and dist-tag writes
   must remain disabled.
7. Once the workflow succeeds, review the staged version and its archive
   through npmjs.com's **Staged Packages** page or:

   ~~~sh
   npm stage list @0xbuff/throughline
   npm stage view <stage-id>
   npm stage download <stage-id>
   ~~~

   Confirm the exact version, contents and provenance, then, with final maintainer authorization, approve
   **that stage only** with npm account 2FA:

   ~~~sh
   npm stage approve <stage-id>
   ~~~

8. Confirm the registry version, latest dist-tag, clean installation,
   public exports and npm provenance:

   ~~~sh
   npm view @0xbuff/throughline version
   npm view @0xbuff/throughline dist-tags
   npm view @0xbuff/throughline@0.2.0 version
   ~~~

   Download the `throughline-release-<run-id>` GitHub artifact and extract its
   `release-artifacts/RELEASE_MANIFEST.json`. In the source checkout for the
   **published version**, run:

   ~~~sh
   node scripts/verify-registry-release.mjs release-artifacts/RELEASE_MANIFEST.json
   node scripts/audit-registry.mjs release-artifacts/RELEASE_MANIFEST.json
   ~~~

   The first command fetches the live npm metadata and tarball and requires the
   published SHA-256 to **exactly match the staged archive** as well as registry
   SHA-1/SHA-512, public `latest` tag and provenance metadata. The second
   independently installs `@0xbuff/throughline@0.2.0` **from the registry**,
   runs the standalone CLI and package export/semantic smoke checks in Node,
   validates optional React 19 installation, and runs `npm audit signatures`
   against the clean installed dependency tree. It does **not** read local
   source instead of the installed registry package.

   Inspect [npm's package page](https://www.npmjs.com/package/@0xbuff/throughline)
   for the provenance badge, GitHub workflow URL, signed commit, signature
   verification and public dist-tag. Archive the actual test output and any
   discrepancies in the release record; do not mark TL-U19 complete until
   verified registry publication and independent consumer/provenance evidence
   exist. TL-U20 (real docs app) must wait for this gate.

## Operational safeguards

- `publish.yml` is manual-only and uses the version from the GitHub-verified
  signed annotated tag, and refuses a stale tag not equal to current main.
  Human TL-U18 approval must match the source and candidate tarball before the
  protected `npm-publish` job is eligible. The registry preflight checks
  published versions but **cannot see unapproved npm stages**; do not attempt
  to stage a version twice because staged versions can return `E409`.
- The workflow uses `actions/setup-node` **without** `registry-url`
  in the OIDC job. Supplying `registry-url` can inject a placeholder
  `NODE_AUTH_TOKEN`, causing legacy-token `E401` failures. The job
  requires GitHub OIDC request variables and rejects conventional tokens.
- A Sigstore transparency entry by itself does **not** prove that
  registry staging succeeded. Confirm the workflow's successful stage
  ID before requesting approval.
- No GITHUB_TOKEN/NPM_TOKEN can approve staged npm versions; a human
  approval with npm 2FA is always required.
- Only the protected staging job has `id-token: write`; ordinary CI
  and verification remain read-only.

## References

- [npm staged publishing](https://docs.npmjs.com/staged-publishing/)
- [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/)
- [GitHub protected environments](https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments)
