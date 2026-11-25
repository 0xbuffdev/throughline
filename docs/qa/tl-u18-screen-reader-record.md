# TL-U18 — Real screen-reader candidate acceptance record

**Evidence status: NOT PERFORMED.** This file is an instructions/template, not test evidence. Do not change this heading to “passed” or close TL-U18 until an actual operator tests a real screen reader on the exact candidate and attaches the completed record to the PR. Automated DOM/ARIA checks do not simulate or certify spoken announcements.

## Candidate identity (fill in after the final code revision)

| Field | Actual tested value |
| --- | --- |
| Date/time and time zone | NOT PERFORMED |
| Tester or pseudonym | NOT PERFORMED |
| Candidate source Git SHA (40 characters) | NOT PERFORMED |
| Candidate tarball path and SHA-256 from `sha256sum` | NOT PERFORMED |
| CI run that passed for that exact source SHA | NOT PERFORMED |
| Test URL or local independently installed archive consumer | NOT PERFORMED |
| OS and version | NOT PERFORMED |
| Screen-reader name and version (NVDA, VoiceOver, etc.) | NOT PERFORMED |
| Browser and version (Firefox, Chrome, Safari, etc.) | NOT PERFORMED |
| Display/zoom, keyboard, and speech settings | NOT PERFORMED |

### Reproduce the candidate

After U29 and the reviewed release-candidate source is merged, use the exact `throughline.tgz` produced by the release workflow's successful `prepare` run. Download its checksum, commit and candidate manifest; do not repack a new archive for final acceptance.

~~~sh
sha256sum --check SHA256SUMS
cat RELEASE_COMMIT
~~~

Install the tarball into a fresh consumer with React 19 and use a representative full app/page. Record the *actual* archive SHA-256. For Windows testing, use PowerShell `Get-FileHash -Algorithm SHA256 .\throughline.tgz`, or record the CI-produced archive checksum if the tested bytes exactly match. The unit/browser suites may validate code, but the manual record must be made against the actual unpacked UI with real AT enabled.

### Screen-reader test sequence

For each case, write **browser and screen reader**, **action**, **literal or accurately transcribed heard announcement**, **pass/fail**, and **deviation**. These are the essential checks for a truthful data-first explanation UI:

| Case | User action and expected semantic content | Heard announcement / result |
| --- | --- | --- |
| AT-01 | Navigate to the player group named “Visualization player” using the screen reader and Tab; locate playback controls and keyboard help | NOT PERFORMED |
| AT-02 | Focus playback buttons and step forward; labels “Step forward” and live “Step N of M” update are announced when appropriate, without repetitive speech that makes use impractical | NOT PERFORMED |
| AT-03 | Seek with Home/End/left/right while focus is on playback/player controls; in the Visualization view tab list Left/Right and Home/End instead activate tabs. Use Tab to leave the list. Repeat in screen-reader browse/focus modes; verify controls and reading order | NOT PERFORMED |
| AT-04 | Select Graph then State in the Visualization view tab list; frame and source selection persist. Equivalent modeled cells (including retained values for absent entities) and current-frame events are traversable with real table/heading navigation; inspect event pages if present | NOT PERFORMED |
| AT-05 | Activate Inspect (pressed toggle); locate Workflow inspector, expand Source details and Compare steps to reach Evidence inspector and What changed?; inspect source-event references and close with Escape/Close inspector. Verify restored focus and no guessed causality | NOT PERFORMED |
| AT-06 | Inspect known JSON `null`, absent nested path, and unknown entity; differences are spoken distinctly, rather than all appearing blank | NOT PERFORMED |
| AT-07 | Select Sequence for distributed checkout; traverse current and earlier/later pages and Source details; missing received/acknowledged/processed phases remain clearly “not modeled,” never silently converted into persistence | NOT PERFORMED |
| AT-08 | Navigate in a narrow 260/320/375 CSS-px embed and at native 200%/400% browser zoom; all critical controls remain reachable with a hardware keyboard and visible/announced focus | NOT PERFORMED |
| AT-09 | Enable reduced-motion preference; no speech starts without explicit opt-in; reported caption and relevant source identity remain available if optional audio is disabled | NOT PERFORMED |
| AT-10 | Disable or switch screen reader on/off and repeat a representative navigation; errors/traps, redundant speech and inaccessible controls are documented | NOT PERFORMED |

For any failure, note the exact reproducible steps, observed versus expected behavior, severity, source commit, screenshots/transcript (if consented), and corrective PR. A screenshot of aria attributes without a screen-reader run is *not* an actual AT-01–AT-10 result. Avoid publishing personal medical/accessibility details or user recordings without consent.

### Acceptance decision (completed by actual tester/reviewer)

- Overall: **NOT PERFORMED**
- Blocking findings and linked issues: **NOT ASSESSED**
- Remaining deviations/limitations: **NOT ASSESSED**
- Tested package/source identity matching final review SHA: **NOT VERIFIED**
- Reviewer, date/time and link to completed evidence (PR attachment, secured QA record or review comment): **NOT PROVIDED**

**Submission:** attach a completed copy of this record to the current release-candidate review or link the human-reviewed QA artifact from the prepare-run review record. Historical [TL-U18 source PR #44](https://github.com/0xbuffdev/throughline/pull/44) is not the final candidate. Link the exact prepare run and attempt in the release attestation. The maintainer confirms the tested commit and package hash, addresses any failures and reruns exact-head CI where needed. If code is updated after the test, the record must be repeated or explicitly demonstrated applicable to the changed candidate. TL-U18 cannot be marked complete by a green browser test or by filling only the machine-readable fields.

TL-U19 retains its independent signed package/tag/provenance and final release decision, but does not replace this TL-U18 acceptance evidence.
