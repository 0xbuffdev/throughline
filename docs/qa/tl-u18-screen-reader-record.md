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

Use the exact PR branch SHA under review (not an older CI preview), Node 24+, pnpm 11.2.2, and the committed lockfile:

~~~sh
git fetch origin
git switch --detach <exact-tested-commit-sha>
pnpm install --frozen-lockfile
pnpm test:run
pnpm build
pnpm pack --out throughline-u18-candidate.tgz
sha256sum throughline-u18-candidate.tgz
~~~

Install the tarball into a fresh consumer with React 19 and use a representative full app/page. Record the *actual* archive SHA-256. For Windows testing, use PowerShell `Get-FileHash -Algorithm SHA256 .\throughline-u18-candidate.tgz`, or record the CI-produced archive checksum if the tested bytes exactly match. The unit/browser suites may validate code, but the manual record must be made against the actual unpacked UI with real AT enabled.

### Screen-reader test sequence

For each case, write **browser and screen reader**, **action**, **literal or accurately transcribed heard announcement**, **pass/fail**, and **deviation**. These are the essential checks for a truthful data-first explanation UI:

| Case | User action and expected semantic content | Heard announcement / result |
| --- | --- | --- |
| AT-01 | Navigate to the player region using screen-reader landmarks/quick navigation; “Visualization player” has an accessible name and discoverable keyboard help | NOT PERFORMED |
| AT-02 | Focus playback buttons and step forward; labels “Step forward” and live “Step N of M” update are announced when appropriate, without repetitive speech that makes use impractical | NOT PERFORMED |
| AT-03 | Seek with Home/End/left/right, then repeat with a screen reader in browse/focus modes; controls remain operable and reading order is logical | NOT PERFORMED |
| AT-04 | Switch graph to state table; equivalent modeled entity values, time/frame, and evidence are traversable using real table/heading navigation | NOT PERFORMED |
| AT-05 | Enter Inspect; “Evidence inspector,” “What changed?” and event-source references are communicated in a usable order; a source event never becomes a guessed causal assertion | NOT PERFORMED |
| AT-06 | Inspect known JSON `null`, absent nested path, and unknown entity; differences are spoken distinctly, rather than all appearing blank | NOT PERFORMED |
| AT-07 | Traverse distributed checkout sequence evidence; missing received/acknowledged/processed phases remain clearly “not modeled,” never silently converted into persistence | NOT PERFORMED |
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

**Submission:** attach a completed copy of this record to [the TL-U18 source PR](https://github.com/0xbuffdev/throughline/pull/44) or link the human-reviewed QA artifact from the PR. The maintainer confirms the tested commit and package hash, addresses any failures and reruns exact-head CI where needed. If code is updated after the test, the record must be repeated or explicitly demonstrated applicable to the changed candidate. TL-U18 cannot be marked complete by a green browser test or by filling only the machine-readable fields.

TL-U19 retains its independent signed package/tag/provenance and final release decision, but does not replace this TL-U18 acceptance evidence.
