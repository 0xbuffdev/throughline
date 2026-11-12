# Release-candidate verification — changes after v0.0.2

**Assessment date:** 2026-11-12  
**Outcome:** **INCONCLUSIVE — release acceptance is not established.**  
**Execution boundary:** Verification and test tooling only. No production fix, merge, release, npm stage, tag, or approval.

## 1. Exact scope

- **Published baseline:** signed `v0.0.2` tag, commit `ab62dd02661701bb2e26014732f765c73bd4e9f7`.
- **Candidate observed:** `main` at `26d4e81756e28a6c28ac9f0c4b3dbc2e86b6f8c9` (post-PR #30).
- GitHub `v0.0.2...main` reports **251 commits**. This is the source comparison, not a claim of 251 independently reviewed commits.
- Includes reference traces, UI shell, scene projection, viewport/zoom, hierarchy, scenarios and explanations, Remark/MDX, packed framework/Markdown integrations, adaptive footer and captions, persistent workflow trail, opt-in step sounds and opt-in speech narration.
- `package.json` remains at version `0.0.2`; this is not a new registry release candidate or published build.

The source architecture, API, `AGENTS.md`, `RELEASING.md`, `docs/release-hardening.md` and applicable acceptance gates govern this verification. Private planning materials are not copied into this public repository.

## 2. Checks actually observed

The exact candidate commit has a **successful GitHub Actions push run**, [Throughline CI #43212453210](https://github.com/0xbuffdev/throughline/actions/runs/43212453210), on 2026-11-12. The run's job and decoded logs were inspected.

| Check | Observed result |
| --- | --- |
| Node 24, pnpm 11.2.2, frozen lockfile, unchanged lockfile | Passed |
| Public-source boundary audit, workflow YAML parse | Passed |
| TypeScript typecheck; playground typecheck and Vite build | Passed |
| Unit/compiler suite | **235 passed, 33 files** |
| Chromium browser suite | **82 passed, 14 files**, headless Chrome for Testing 158 |
| Distributable exports, declarations, build smoke checks | Passed |
| Runtime and peer licenses | Passed |
| Packed Node, TypeScript, React SSR and MDX consumers | Passed |
| Packed Vite React SSR/hydration, keyboard/touch/mobile | Passed |
| Isolated Fumadocs, Next.js and Astro consumers | Passed |
| `react-markdown`, `mdx-bundler`, `markdown-to-jsx` consumers | Passed |
| Firefox and WebKit browser regression suites | **Not established at report creation; see QA workflow on this PR** |
| Real audio output, physical devices, screen readers, real documentation app | **Not executed / not evidenced here** |

**Provenance:** The checks above were executed by the linked CI runner, not in a separate local checkout. The local execution environment had no route to clone GitHub or install repository dependencies; no unexecuted command is counted as a pass. The additional browser workflow in this PR runs the **same 82-test suite** under Firefox/WebKit on GitHub-hosted runners; verify its actual conclusions before updating this record.

## 3. Acceptance coverage and limitations

| Area | Automated evidence | Limit / remaining work |
| --- | --- | --- |
| Version-1 compatibility, compiler limits, deterministic frames and seek | Unit fixtures, baseline-contract, snapshot/projection tests | Compare known fixture outputs with the prior published package in a clean external consumer if an exact binary-compatibility decision is needed |
| Reference cases and truthful causal/transfer events | Reference and scenario tests | Human comprehension comparison V-10 not done |
| Responsive layout and visual presentation | Chromium DOM geometry, dense graphs, 260–420px embeds, titles/controls, bounded caption details | Human visual review on Firefox/WebKit/Safari, text zoom, real mobile devices |
| Keyboard, touch, focus, inspector, fullscreen and reduced motion | Chromium/browser and packed Vite smoke checks | NVDA/JAWS/VoiceOver/TalkBack validation and keyboard-only manual audit |
| Narration and sound ownership/lifecycle | Browser tests with mocked Web Speech and Web Audio boundaries | Real voice availability, permissions, quality, interruption and speaker output remain unverified |
| React, SSR, Markdown/MDX and deployment compatibility | Locked disposable consumers and built distributable | No validation of the live documentation app or deployed host integration |
| Security, inert source, source-size and work limits | Source audit, parser tests, literal MDX/Remark and pack checks | Serialized external traces are not exhaustively validated by the player; host must validate untrusted serialized inputs |
| Performance | Diagnostic dense-layout samples in existing tests | No calibrated, repeatable thresholds or cross-device memory/latency acceptance |
| Licenses and distribution | CI license/package/source checks | Historical source rights and public Git-history exposure review are separate |

## 4. Findings (absence of evidence is not a reproduced implementation defect)

**QA-01 — P1 / release gate:** V-10 real-participant comprehension study is unverified. Compare matched static and interactive material on structure, transfers and failure causes; record recruitment, tasks, scoring, raw anonymized results, and limitations. Do not invent participants or equate visual approval with comprehension.

**QA-02 — P1 / release gate:** Real speech, screen-reader and physical-device tests are unverified. Mocked `speechSynthesis` verifies control flow but not speech intelligibility, hardware interruption behavior, browser audio permission, queue interaction with third-party players, or mobile operating-system assistive technology. Manually test opt-in, pause/resume, seeking, same-step restart, two simultaneously mounted players, source changes, unmount and silent fallback.

**QA-03 — P1 / integration gate:** Locked fixture builds do not verify the actual documentation application, its plugin order, rendered MDX pages and React bridge. The separately owned documentation integration is required before claiming end-to-end docs acceptance.

**QA-04 — P2 / browser coverage:** Initial green CI ran Chromium only. This PR adds an opt-in browser selector and independent Firefox/WebKit matrix over the **existing full browser suite**. CI execution on the PR must be inspected; an installed browser or a triggered workflow alone does not constitute a pass.

**QA-05 — P2 / performance evidence:** Existing single-run layout/heap diagnostics do not establish repeatable thresholds. Collect warm and cold samples on fixed hardware, at small/moderate/near-limit graph sizes and 320/720px widths. Record median, tail, heap, layout crossings and version deltas; investigate meaningful regressions before setting a gate.

**QA-06 — P1 / design-decision gate:** Proposed Markdown/Remark and hierarchical group compatibility decisions must receive explicit maintainer acceptance. A merged source PR or a merged proposal does not change the document's own proposal status.

**QA-07 — P1 / source-history and publication gate:** Historical public-source references and distribution rights must be reviewed separately. Update SemVer/changelog, verify package archive, and follow the signed-tag/manual staged-publication process only after authorized review. The published `0.0.2` version cannot be reused for a new package.

These findings describe **unclosed verification/release gates**. The checks inspected did not establish a reproducible regression defect in the reviewed candidate. **Do not infer absence of defects from passing tests.**

## 5. Reproducible retest instructions

On the exact reviewed candidate with Node 24+, pnpm 11.2.2 and a clean lockfile:

```sh
pnpm install --frozen-lockfile
pnpm audit:source
pnpm typecheck
pnpm preview:typecheck
pnpm preview:build
pnpm test:run
pnpm exec playwright install --with-deps chromium firefox webkit
pnpm test:browser:run
THROUGHLINE_QA_BROWSER=firefox pnpm test:browser:run
THROUGHLINE_QA_BROWSER=webkit pnpm test:browser:run
pnpm build
pnpm audit:licenses
pnpm audit:pack
pnpm audit:browser
pnpm audit:frameworks
pnpm audit:markdown-hosts
```

In each of Chromium, Firefox, WebKit and on actual devices, review the source-backed playground (`pnpm dev`) at 260, 300, 320, 360, 375, 768, 960 and 1600px available widths. Confirm no clipped toolbar controls, no horizontal overflow, readable node labels, stable diagram/control positions when long explanations expand, consistent contrast, reduced motion and keyboard focus. Test both themes, two audio controls, no audio, narration only and sonification only. Inspect screenshot differences as evidence rather than silently updating snapshots.

Perform keyboard-only and screen-reader passes on the caption disclosure, timeline, chapter selector, entity selector, fullscreen failure, scenario changes, status announcements and narration errors. Test with 200% and 400% page zoom, high contrast and device-level reduced-motion settings. Document browser/OS/device/assistive-technology versions, exact inputs and observed outcomes.

For reproducible bugs, record the fixture, preconditions, numbered actions, expected behavior, observed behavior, severity and a screenshot/log or trace reference. Separate regressions from `v0.0.2`, existing issues and infrastructure failures.

## 6. Decision and next actions

**Result: INCONCLUSIVE / NOT CLEARED FOR RELEASE.** The candidate's standard CI is green. The extra cross-browser checks and manual/human/integration/performance/governance gates have no completed evidence in this report. Review the QA workflow outcomes, address any defects on separate production-fix PRs, retest the exact new revision, and close or explicitly re-scope the remaining gates through maintainer review before preparing a signed package release. This QA PR does not approve, merge or publish anything.
