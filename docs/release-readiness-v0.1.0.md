# Throughline v0.1.0 — release readiness

**Readiness: Blocked for publication.** This is a preparation record, not a
signed release, approval to stage, npm publication or deployment.

## Baseline and scope

- Repository: [0xbuffdev/throughline](https://github.com/0xbuffdev/throughline).
- Latest published baseline: `v0.0.2`, commit
  `ab62dd02661701bb2e26014732f765c73bd4e9f7`.
- Preparation branched from `main` at
  `2b713bf0f628ea6a728d3ed99513c3349c64a91e` on 2026-11-12.
- Proposed package: `@0xbuff/throughline@0.1.0`. `Program.version` and
  `Trace.version` remain `1`; neither a source version bump nor a
  passing test publishes a package.
- Candidate capabilities since v0.0.2: scene projection and hierarchy,
  responsive player, guided navigation, captions and explanations,
  independent scenarios, opt-in speech/sound, Remark/MDX, independent
  host integrations and public reference traces. See the
  [changelog](../CHANGELOG.md), [draft release notes](release-notes-v0.1.0.md)
  and [migration guide](migration-v0.1.0.md).

## Verified automated evidence — pre-preparation source

- [`main` CI, `2b713bf`](https://github.com/0xbuffdev/throughline/actions/runs/43249268893):
  **success** (2026-11-12) for the compiler, Chromium player,
  development playground, source/license and packed-consumer workflows.
- [PR #32 normal CI](https://github.com/0xbuffdev/throughline/actions/runs/43217293735):
  **success**, head `4392eaa8`. The PR records 235/235 unit and
  82/82 Chromium browser tests, plus build and packed Node/React/Markdown
  consumers.
- [PR #32 Firefox/WebKit matrix](https://github.com/0xbuffdev/throughline/actions/runs/43217293007):
  **success**, head `4392eaa8`: 82/82 Firefox and 82/82 WebKit tests,
  including the original compact-height assertion and containment checks.
- The [earlier QA report](release-qa-post-v0.0.2.md) records a
  **failed pre-fix WebKit** run; do not incorrectly transfer that failure
  to the subsequent fix.
- These runs do **not** verify the new release-preparation branch or
  its adjusted publish workflow. Recheck the final PR head and merged SHA.

## Open acceptance and release blockers

1. **Rights and history:** Review source ownership, third-party notices,
   historical public references to private planning, and distribution rights.
   Removing links from current Markdown does not erase public history.
2. **Human tests:** Record real-device browser visuals, keyboard-only and
   screen-reader use, 200%/400% zoom, actual opt-in speech/step-audio
   operation and interruption. Mocked browser interfaces are not hardware evidence.
3. **V-10:** Complete the defined real-participant comprehension evaluation
   against matched static material (methods, results, limitations), or
   obtain an explicit approved scope decision; do not silently waive it.
4. **Live host integration:** Exercise the actual documentation application
   against this release candidate. Packed framework fixtures alone cannot
   establish a successful downstream deployment.
5. **Performance and compatibility:** Obtain repeatable measurement evidence
   and explicit maintainer decisions on the Remark/MDX and optional group
   hierarchy compatibility proposals.
6. **Release governance:** Review the final archive/changelog; ensure the
   final branch and merged `main` checks are green; inspect protection
   for `v*` tags and required CI. The observed active main-branch ruleset
   requires a PR but lists **no required status check** as of this audit.
   Final signing, merge and npm account approvals remain maintainer actions.

These are unclosed evidence/approval gates, not claims that the tested
implementation is defective.

## Controlled publication (only after clearance and authorization)

Follow [the release checklist](../CONTRIBUTING.md#release-checklist).
From the reviewed and merged `main` commit, create and verify a new
signed immutable `v0.1.0` tag. Manually dispatch `publish.yml` on
`main` with `v0.1.0` and `STAGE-v0.1.0`. The verification job builds
the review archive and checksum; the protected `npm-publish` job alone
may obtain OIDC write permission and stage with provenance.
Inspect the stage ID, tarball, provenance and npm account 2FA approval
separately. Staging is not publication.

## Post-release verification, monitoring and rollback

After separate maintainer authorization and final npm 2FA approval:
check registry version/dist-tags, install `@0xbuff/throughline@0.1.0`
in a fresh consumer, verify all five exports and npm provenance,
monitor dependency/compatibility reports and any real documentation
deployment, and record the exact tag, SHA, workflow run, stage ID,
archive digest and observed outcomes.

Published npm versions are immutable. For a regression, pause downstream
adoption and roll host consumers back to an **explicitly tested** prior
release if compatible; then prepare a new reviewed patch version and
signed tag. Do not rewrite `v0.1.0`, overwrite a published tarball,
or change dist-tags without separate authorization.
