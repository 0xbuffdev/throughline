# TL-U18 — Schema-2 release-quality evidence

Throughline's initial schema-2 release is a correctness and security decision before it is a publication decision. This document defines how to reproduce and inspect its automated evidence and what must still be checked by a person. It does not authorize npm publication, assert a performance SLA, or claim improved learning outcomes.

**Status:** release-gate implementation in source. The evidence is authoritative only for the exact successful CI source SHA recorded in each JSON file. Source work closes on a reviewed merge; TL-U19 separately controls the signed package and npm registry, and TL-U20 controls the live documentation application.

## Automated acceptance matrix

| Gate | Command / CI stage | Required evidence | Pass condition |
| --- | --- | --- | --- |
| Pure v2 artifact truth | `pnpm test:run` | Schema, compiler, query, source-ID and reference truth cases | All tests pass; unknown, absent, null, missing message phases and false persistence remain distinct |
| Hostile input, manifest and filesystem | `pnpm test:run`, `pnpm audit:source` | `v2-security.json` and existing CLI/authoring tests | Seeded malicious inputs rejected, no prototype poisoning, unsafe root paths/symlinks and unreviewed/stale sidecars rejected |
| Performance and deterministic work | `pnpm test:run`, `node scripts/verify-release-evidence.mjs` | `v2-performance.json`, canonical fixture hashes, Node/CPU/runner version, sizes and iteration distribution | All three valid sizes compile deterministically, source IDs and geometry stay truthful, fixed semantic work ceilings are honored; numerical timings are recorded, **not** used as arbitrary CI cutoffs |
| Keyboard and semantic accessibility | `pnpm test:browser:run` | Chromium and separate Firefox/WebKit jobs, `v2-browser-*.json` | Named player/controls, status, evidence regions, Home/End/arrows and 260px container checks pass in every browser |
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

Compilation and projection pass only when frame identities, provenance, immutability, replay determinism, geometry bounds and query truth are established independently of time. Benchmarks that merely run and print a fast number **do not** pass.

The companion seed `0x18a2b47d` drives 144 reproducible hostile-input checks across invalid schemas, duplicate keys, unsupported events, unsafe data, cross-reference failures, malformed Unicode, prototype keys and conflicting writes, plus ten unsafe pathname cases. The suite logs the seed and outcomes; it does not stand in for an external security audit or comprehensive fuzzing.

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

Local test execution writes JSON to `.release-evidence/` (gitignored). Local records are **not** exact-head CI attestations without the GitHub-provided SHA/run ID. Compare numeric timings only when workload hash and runtime/runner conditions are comparable. The primary PR CI also checks the frozen lockfile and project/public-source boundaries.

## Manual accessibility and device sign-off

Automation inspects semantic roles, text alternatives, controls, labels, keyboard transitions, reduced-motion behavior, hydration and narrow embeds. It **cannot** listen to a real assistive technology user, verify operating-system voices, evaluate reading order by itself, or replace a human's perception of clipping or contrast.

Before authorizing TL-U19 publication, review and record the following on the actual candidate package or a staging host:

1. **Keyboard-only:** At 260/320/375 CSS-px widths, Tab and Shift+Tab reach all player controls. Home/End, left/right, step number, popover open/close, Inspect, view selection and focus after seek operate without a keyboard trap. Focus rings remain visible.
2. **Screen readers:** Test NVDA with current Windows/Firefox or Chrome and VoiceOver on Safari/macOS or iOS, noting versions. Check group name, step-count status announcement, graph text equivalent, state table and evidence table headers, unknown/absent/null phrases and live update verbosity. Record any additional assistive technology, such as TalkBack, actually tested; do not claim coverage of every AT from role-only tests.
3. **Zoom and text scaling:** Use **real browser zoom at 200% and 400%**, plus the operating system's preferred text scaling, for both a narrow embed and a full-width page. Check content reflow, no clipped critical controls, readable focus, scroll reachability and understandable captions. Automated `font-size` checks are supplemental, not equivalent to browser zoom.
4. **Reduced motion:** Enable OS reduced-motion preference; inspect graph changes, step selection and any narration/transfers for unintended animation. Contrast and text size must remain legible.
5. **Optional audio:** With no narration or sonification enabled, confirm silence and no provider calls. If explicitly opted in, check consent, pause/seek/unmount cleanup, multiple-player contention and accessible transcript parity. Browser speech can use OS/browser-managed services, but core never initiates provider calls.
6. **Host recovery:** Inspect unreviewed/malformed Markdown build errors and ensure they reveal neither secrets nor a readable but unauthorized model. Confirm unrelated math, Mermaid and normal Markdown still render.

Record **date, operator, browser+OS+AT versions, tested package SHA, pass/fail, deviations, and links to evidence** in the release review. Leave an unexecuted check as **not performed**, not as passed. A failed accessibility case warrants correction and new exact-head automated/manual evidence before release approval.

## Gate boundaries

An approved TL-U18 source PR means the release-quality *machinery and evidence* have passed at that revision, not that any tagged package is published, the documentation app is upgraded or a participant study succeeded. If a manual review has not been conducted, it remains explicitly outstanding for the TL-U19 release decision. Do not create a guessed numerical performance target or conceal neutral/negative findings.

The owner separately approves source merges, tags, npm staging, protected environment access, final npm 2FA publication and documentation deployment. See [release procedure](releasing.md), [semantics](schema-v2.md) and [reference truth suite](reference-traces.md).
