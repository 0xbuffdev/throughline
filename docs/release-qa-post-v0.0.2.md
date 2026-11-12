# Release-candidate verification — changes after v0.0.2

**Assessment date:** 2026-11-12  
**Outcome:** **FAIL — one repeatable WebKit layout assertion fails and release acceptance is not established.**  
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
| Firefox full browser regression suite | **83 passed, 15 files**, including added non-overlap geometry — [QA matrix #43214998502](https://github.com/0xbuffdev/throughline/actions/runs/43214998502); earlier 82/82 twice | 
| WebKit full browser regression suite | **82 passed, 1 failed (15 files)** — [QA matrix #43214998502](https://github.com/0xbuffdev/throughline/actions/runs/43214998502); same original compact-height failure reproduced on three executions; added non-overlap geometry test passes | 
| QA branch normal unit/Chromium/packed CI | **Passed on earlier QA commit** — [PR CI #43214005254](https://github.com/0xbuffdev/throughline/actions/runs/43214005254); the later geometry commit's [CI #43214998532](https://github.com/0xbuffdev/throughline/actions/runs/43214998532) must be checked separately |
| Real audio output, physical devices, screen readers, real documentation app | **Not executed / not evidenced here** |

**Provenance:** The checks above were executed by the linked CI runner, not in a separate local checkout. The local execution environment had no route to clone GitHub or install repository dependencies; no unexecuted command is counted as a pass. The QA matrix ran the original 82 tests and subsequently an additional geometry regression in Firefox/WebKit. The WebKit failure reproduced on the rerun and again with the new geometry test; it was not waived.

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

**QA-04 — P2 / reproduced cross-browser toolbar-layout assertion (failed):** On Linux GitHub Actions WebKit 27.2 with the 1,600 × 900 viewport, `src/react/__tests__/toolbar.browser.test.tsx:30` fails `expect(bottom.getBoundingClientRect().height).toBeLessThan(55)`: **observed 56px**. Steps: (1) checkout QA branch `05fefb6` with Node 24/pnpm 11.2.2, (2) `pnpm install --frozen-lockfile`, (3) `pnpm exec playwright install --with-deps webkit`, (4) `THROUGHLINE_QA_BROWSER=webkit pnpm test:browser:run`. The two initial workflow attempts gave **81/82 passed and the same failure**: [release-browser run #43214005524](https://github.com/0xbuffdev/throughline/actions/runs/43214005524). The subsequent [matrix run #43214998502](https://github.com/0xbuffdev/throughline/actions/runs/43214998502) with an independent bounds/overlap test gave WebKit **82/83 passed** and Firefox **83/83 passed**. The new geometry test passes in WebKit at 1600, 960, 375 and 320px viewport widths: interactive controls are within toolbar bounds and do not overlap. Therefore this finding is **a cross-browser compact-height threshold failure**, not demonstrated control clipping or overlap in the widths checked. This is a real, repeatable **test failure**; its cause may be a WebKit-native control metric vs. intended CSS spacing. The assertion alone does not prove overlap, clipping or an accessibility violation. Inspect the WebKit screenshot and component/control geometry and determine whether CSS should be corrected or the strict pixel assumption is unsupported. Do **not** relax the check merely to make CI green.

**QA-05 — P2 / performance evidence:** Existing single-run layout/heap diagnostics do not establish repeatable thresholds. Collect warm and cold samples on fixed hardware, at small/moderate/near-limit graph sizes and 320/720px widths. Record median, tail, heap, layout crossings and version deltas; investigate meaningful regressions before setting a gate.

**QA-06 — P1 / design-decision gate:** Proposed Markdown/Remark and hierarchical group compatibility decisions must receive explicit maintainer acceptance. A merged source PR or a merged proposal does not change the document's own proposal status.

**QA-07 — P1 / source-history and publication gate:** Historical public-source references and distribution rights must be reviewed separately. Update SemVer/changelog, verify package archive, and follow the signed-tag/manual staged-publication process only after authorized review. The published `0.0.2` version cannot be reused for a new package.

The WebKit cross-browser check is **reproducibly failing**, while the additional cross-browser control-bounds test **passes** and remaining items are **unclosed verification/release gates**. The source and logs do not yet establish the WebKit discrepancy as a user-visible layout defect rather than a too-strict test assertion; it must be triaged. **Do not infer absence of defects from passing tests.**

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

**Result: FAIL / NOT CLEARED FOR RELEASE.** The candidate's standard CI and Firefox browser suite are green, but **the WebKit 56px vs. <55px check failed three times, even though the separate non-overlap/control-bounds test passed**. The manual/human/integration/performance/governance gates remain unclosed. Triage the discrepancy on its merits, fix confirmed product defects on separate production-fix PRs if needed, and retest the exact new revision. Close or explicitly re-scope the remaining gates through maintainer review before preparing a signed package release. This QA PR does not approve, merge or publish anything.
