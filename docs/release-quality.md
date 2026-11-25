# TL-U18 — Schema-2 release-quality evidence

Throughline's initial schema-2 release is a correctness and security decision before it is a publication decision. This document defines how to reproduce and inspect its automated evidence and what must still be checked by a person. It does not authorize npm publication, assert a performance SLA, or claim improved learning outcomes.

**Status:** automated release-gate implementation in source; **TL-U18 final acceptance is pending stable Mermaid production cutover (TL-U29) and real screen-reader verification** on the exact integrated source/package-SHA-bound candidate. Green DOM/ARIA tests cannot close that requirement. The automated evidence is authoritative only for the exact successful CI source SHA recorded in each JSON file. TL-U19 separately controls the signed package and npm registry, and TL-U20 controls the live documentation application.

## Automated acceptance matrix

| Gate | Command / CI stage | Required evidence | Pass condition |
| --- | --- | --- | --- |
| Stable Mermaid production Graph and Sequence (TL-U26–TL-U29) | Reviewed feasibility, focused adapter/cutover tests and independently packed React host | All four canonical references, source-ID mapping, native State/evidence fallback, synchronized playback, hostile/boundary inputs, three-browser SSR/hydration and keyboard parity, measured limits and license/notice review | Required parity passes before final TL-U18 acceptance and TL-U19 publication; development preview alone is insufficient |
| Pure v2 artifact truth | `pnpm test:run` | Schema, compiler, query, source-ID and reference truth cases | All tests pass; unknown, absent, null, missing message phases and false persistence remain distinct |
| Hostile input, manifest and filesystem | `pnpm test:run`, `pnpm audit:source` | `v2-security.json` and existing CLI/authoring tests | Seeded malicious inputs rejected, no prototype poisoning, unsafe root paths/symlinks and unreviewed/stale sidecars rejected |
| Performance and deterministic work | `pnpm test:run`, `node scripts/verify-release-evidence.mjs` | `v2-performance.json`, canonical fixture hashes, Node/CPU/runner version, sizes and iteration distribution | All three valid sizes compile deterministically, source IDs and geometry stay truthful, fixed semantic work ceilings are honored; numerical timings are recorded, **not** used as arbitrary CI cutoffs |
| Keyboard and semantic accessibility | `pnpm test:browser:run` | Chromium and separate Firefox/WebKit jobs, `v2-browser-*.json` | Named player/controls, status, evidence regions, Home/End/arrows and 260px container checks pass in every browser |
| **Actual assistive-technology acceptance (TL-U18)** | Human test on the exact reviewed candidate with NVDA/VoiceOver or another real screen reader | [Dated AT evidence record](qa/tl-u18-screen-reader-record.md) identifying source SHA, tested tarball SHA, OS/browser/AT versions, expected and heard announcements, deviations | **Required to close TL-U18; currently NOT PERFORMED.** Automated role checks are supplemental, not acceptable substitutes |
| Responsive packaged player | `pnpm audit:browser` | Independent npm tarball installed into a Vite React 19 app | SSR hydrates without replacement/errors, 260/320/375 CSS-px player widths, keyboard/touch, text scaling and state-table labels stay usable |
| Real host and package isolation | `pnpm audit:pack`, `pnpm audit:frameworks`, `pnpm audit:markdown-hosts` | Packed Node-only, TypeScript, Remark, MDX, Fumadocs, Next.js and Astro jobs | Real package exports and `thl` executable resolve; no legacy public compiler/player API, no mandatory React or AI SDK in core |
| Cross-browser release QA | `release-qa-browsers.yml` | Firefox/WebKit full browser suite and separate versioned evidence records | Both jobs pass on the exact same PR head |
| Publication rights and provenance | TL-U19 only | Signed/tagged commit, package checksum, npm provenance and independently installed registry artifact | **Not established by TL-U18** |
| Real docs deployment | TL-U20 only | Published-version Fumadocs integration, staging QA and deployment authorization | **Not established by TL-U18** |
| Learning outcomes | TL-U25 only | Consenting human participants and predeclared comparison protocol | **Not established by TL-U18** |

## Measured workload and methodology

The repeatable matrix is produced by `src/__tests__/release-v2-performance.test.ts`. Each input is constructed deterministically from the committed generator; it is a **synthetic modeled system**, not production traffic or a sampled learner. Every row records the canonical schema-2 SHA-256 so a performance comparison cannot quietly switch models.

| Size | Entities | Relations | Groups | Steps | Events | Timed repetitions per operation |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Small | 8 | 12 | 2 | 12 | 24 | 7 |
| Moderate | 64 | 160 | 8 | 240 | 720 | 5 |
| Near-limit valid | 180 | 800 | 12 | 1,500 | 6,000 | 3 |

These sizes sit inside the normative ceilings of 200 entities, 1,000 relations, 200 groups, 2,000 steps, 10,000 events, 1,000,000 validation work units and 8,000,000 expanded trace work units. Individual maxima cannot necessarily be reached *together*: one budget can be exhausted before another.

Each row measures compilation, inspector indexing, 100 reproducible indexed state/diff queries, a combined graph/state-table/Explain projection, trace-wide graph geometry and projected edge geometry at **260** and **720 CSS px**. The measured frame count is `steps + 1`. Each operation is warmed once and then timed using monotonic `performance.now()`. Results report measured minimum, median, nearest-rank 95th percentile and maximum. Heap delta is diagnostic, not an isolated allocation measure; Node GC and shared CI runners can change it dramatically. No automatic CPU-time SLA is asserted before sufficient comparable baseline runs and maintainer review.

Compilation and projection pass only when frame identities, provenance, immutability, replay determinism, geometry bounds and query truth are established independently of time. The graph fixture additionally requires **all declared source relation IDs** to appear once in uncollapsed graph descriptors, with exactly one independently routed edge for each descriptor at both widths, finite geometry, endpoints within their source/destination boxes and bounded bypass labels. An empty edge set cannot pass the gate. Benchmarks that merely run and print a fast number **do not** pass.

The companion seed `0x18a2b47d` drives **144 different** reproducible hostile-input mutations, varying otherwise valid payload values, nested JSON depth, text length and paths. All 12 required attack classes are exercised 12 times each, with SHA-256 uniqueness verified before counting a rejection; 46 distinct unsafe pathname cases are rejected. The independent verifier requires complete class coverage and 144 unique hostile-input hashes, and the test first verifies every varied baseline is valid. This is bounded seed-based regression evidence, not formal comprehensive fuzzing or a third-party audit.

### Where the results live

GitHub Actions archives the exact-source records as **run artifacts**, not as misleading checked-in hardcoded timing values:

- `throughline-v2-quality-<run-id>` — `v2-performance.json` and `v2-security.json`, both validated by the independent verifier before upload.
- `throughline-v2-chromium-<run-id>` — main CI automated browser run record.
- `throughline-v2-firefox-<run-id>` and `throughline-v2-webkit-<run-id>` — independent browser QA results.

The records include source SHA, run ID, Node and V8 versions (performance), CPU model, architecture, OS and workload/fixture hashes. Preserve the relevant GitHub Actions links and their immutable head SHA in the review PR. A previous commit's green result cannot be used to attest a changed commit.

To reproduce locally:

~~~sh
pnpm install --frozen-lockfile
pnpm test:run
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

Local test execution writes JSON to `.release-evidence/` (gitignored). Local records are **not** exact-head CI attestations without the GitHub-provided SHA/run ID. Compare numeric timings only when workload hash and runtime/runner conditions are comparable. The primary PR CI also checks the frozen lockfile and project/public-source boundaries. **On pull requests, that same required CI job first collects exact-head benchmark evidence and then checks out and reruns the entire quality, Chromium, build, packed-host and framework suite against GitHub's proposed merge commit** (`github.sha`). It verifies that the merge commit's second parent is the tested PR head, preventing isolated-head success from masking integration failures against the current base branch.

## Manual accessibility and device sign-off

Automation inspects semantic roles, text alternatives, controls, labels, keyboard transitions, reduced-motion behavior, hydration and narrow embeds. It **cannot** listen to a real assistive technology user, verify operating-system voices, evaluate reading order by itself, or replace a human's perception of clipping or contrast.

**After stable production cutover and before closing TL-U18**, perform and record the real screen-reader checks below on an exact-source candidate package or staging host, following the [screen-reader record template](qa/tl-u18-screen-reader-record.md). This record is not supplied by CI, and none is present for this PR. All other manual release checks can be retested during TL-U19, but the TL-U18 screen-reader criterion cannot be postponed without a separately accepted spec change.

Before authorizing TL-U19 publication, independently review or repeat the release-specific device and rights checks, including:

1. **Keyboard-only:** At 260/320/375 CSS-px widths, Tab and Shift+Tab reach all player controls. Home/End, left/right, step number, popover open/close, Inspect, view selection and focus after seek operate without a keyboard trap. Focus rings remain visible.
2. **Screen readers:** Test NVDA with current Windows/Firefox or Chrome and VoiceOver on Safari/macOS or iOS, noting versions. Check group name, step-count status announcement, graph text equivalent, state table and evidence table headers, unknown/absent/null phrases and live update verbosity. Record any additional assistive technology, such as TalkBack, actually tested; do not claim coverage of every AT from role-only tests.
3. **Zoom and text scaling:** Use **real browser zoom at 200% and 400%**, plus the operating system's preferred text scaling, for both a narrow embed and a full-width page. Check content reflow, no clipped critical controls, readable focus, scroll reachability and understandable captions. Automated `font-size` checks are supplemental, not equivalent to browser zoom.
4. **Reduced motion:** Enable OS reduced-motion preference; inspect graph changes, step selection and any narration/transfers for unintended animation. Contrast and text size must remain legible.
5. **Optional audio:** With no narration or sonification enabled, confirm silence and no provider calls. If explicitly opted in, check consent, pause/seek/unmount cleanup, multiple-player contention and accessible transcript parity. Browser speech can use OS/browser-managed services, but core never initiates provider calls.
6. **Host recovery:** Inspect unreviewed/malformed Markdown build errors and ensure they reveal neither secrets nor a readable but unauthorized model. Confirm unrelated math, Mermaid and normal Markdown still render.

Record **date, operator, browser+OS+AT versions, source commit SHA, tested package SHA-256, heard announcements, pass/fail, deviations, and links to evidence** in the TL-U18 review. The tested package must be the exact downloaded prepare-workflow archive installed in an independent consumer; a locally rebuilt archive is not interchangeable unless its bytes and SHA-256 match. Any new source changes require retesting the new exact candidate. Leave an unexecuted check as **not performed**, not as passed. A failed accessibility case warrants correction and new exact-head automated/manual evidence before release approval.

## Gate boundaries

TL-U18 is not fully accepted until the stable Mermaid production cutover is reviewed and the final integrated candidate passes the automated and real assistive-technology gates. Prior native-only results cannot attest that changed candidate. Green automated source checks establish the tested implementation, **not screen-reader approval**. Once a human verifies and attaches a dated source/package-SHA-bound record with observed announcements and deviations, the maintainer can determine whether the TL-U18 criterion passes. TL-U19 can require a final signed-release recheck, but cannot retroactively satisfy a missing TL-U18 prerequisite. No tagged package is published, the documentation app is upgraded, or a participant study completed by this test suite. Do not create a guessed numerical performance target or conceal neutral/negative findings.

The owner separately approves source merges, tags, npm staging, protected environment access, final npm 2FA publication and documentation deployment. See [release procedure](releasing.md), [semantics](schema-v2.md) and [reference truth suite](reference-traces.md).


## Two-dispatch release candidate gate (F26/F27)

The manual publish workflow now separates preparation from staging. **Neither preparation nor a green workflow approves publication.**

1. On main, after U29 production integration, dispatch the release workflow in `prepare` mode with the prospective version tag and `PREPARE-vX.Y.Z`. The tag need not exist yet. It runs complete exact-source tests in all three browsers, packs once, and uses that same archive for independent Node/React/framework/Markdown consumers and the production Mermaid audit. It retains the tarball, checksum, source, candidate manifest and separate evidence artifacts. No OIDC or staging occurs during preparation.
2. Download the exact prepared tarball. Independently install and test those bytes; record the source SHA and archive SHA-256. Review U29 production parity, license/notice results, actual AT-01–AT-10 and native zoom at 200%/400%, and record a separate maintainer release approval. Link completed records rather than this blank template. No test should be recorded as pass when not performed.
3. After explicit U19 authorization, create the signed annotated tag on that source. Dispatch `stage` from main with the tag, `STAGE-vX.Y.Z`, the successful prepare run ID and attempt, and review JSON containing these exact fields:
   
   ```json
   {
     "sourceSha": "actual 40-character source SHA",
     "archiveSha256": "actual 64-character archive SHA-256",
     "reviewer": "actual reviewer",
     "date": "2026-11-25T12:00:00Z",
     "u29": {"status": "pass", "evidence": "https://example.com/replace-with-reviewed-record"},
     "manualAT": {"status": "pass", "evidence": "https://example.com/replace-with-completed-AT-record"},
     "nativeZoom": {"status": "pass", "evidence": "https://example.com/replace-with-zoom-record"},
     "licenseNotice": {"status": "pass", "evidence": "https://example.com/replace-with-license-review"},
     "releaseApproval": {"status": "pass", "evidence": "https://example.com/replace-with-release-approval"}
   }
   ```

   The values above are illustrative, **not evidence**, and example URLs are rejected. The review timestamp must be at or after successful preparation. The authorization job checks the signed tag, successful prepare workflow attempt on the same current main SHA, exact archive digest, complete automated check set and the structure/identity of the explicit human attestation. The protected `npm-publish` environment reviewer must independently inspect the linked evidence and confirm the actual tester/date/results; the script does not fetch or certify human records. Keep environment protection and separate npm 2FA approval enabled. Staging rechecks the approved checksum and does not rebuild. If main advances before staging, prepare/review a new current candidate or explicitly review a future policy change; this conservative rule prevents an older tagged workflow from bypassing the current gate. Expired artifacts require a new preparation and manual testing of the actual new bytes.

### U29 production audit prerequisite

Until U29 implements and reviews `scripts/audit-mermaid-production.mjs`, preparation intentionally fails closed. Do not substitute the existing copied-adapter feasibility script. The future audit must install `THL_RELEASE_TARBALL` in an independent host, exercise the actual public React exports using `THROUGHLINE_QA_BROWSER`, and emit `.release-evidence/production-mermaid-<browser>.json` only after passing all checks. Its schema is enforced by `scripts/release-candidate-gate.mjs`: schema 1, sourceSha, archiveSha256, run, attempt (strings), browser, renderer (`production-public-package`), status (`pass`), and named checks publicGraph, publicSequence, fourReferences, exactSourceSelection, collapse, fallback, transport, keyboard, ssrHydration, hostileInputs, boundedPerformance (all pass). Review actual test logic and measurements; this contract does not establish U29 parity by itself. Native-only, preview-only, missing or stale records fail the gate.

The strict performance/security verifier now requires all exact fields and check names, reconstructs the deterministic fixture hashes, checks every timing distribution (including geometry), and binds both reports to the same source/run. CI exercises malformed-report rejection using copies of actual generated evidence. No new wall-clock SLA or human acceptance is inferred from these checks.
