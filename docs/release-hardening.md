# TL-I16 — Hardening and release evidence

This is a **source verification record**, not a release authorization.
Use Node.js 24 and pnpm 11.2.2 with the committed lockfile.

```sh
pnpm install --frozen-lockfile
pnpm audit:source
pnpm typecheck
pnpm test:run
pnpm exec playwright install --with-deps chromium
pnpm test:browser:run
pnpm build
pnpm audit:licenses
pnpm audit:pack
pnpm audit:browser
pnpm audit:frameworks
pnpm audit:markdown-hosts
```

The quality-only GitHub Actions workflow runs these gates on pull requests.
It cannot publish the package or attest to a human comprehension study.

## Automated verification map

| Gate | Source of evidence | Limit |
| --- | --- | --- |
| V-01/V-02 | Baseline, compiler, reference-trace, seek and Chromium tests | Version-1 invariants, deterministic frames and arbitrary seeking |
| V-03/V-04/V-06 | Player-shell, tokens, fullscreen and timeline tests | Step-only player, scoped styling and no invented media timing |
| V-05 | Player, viewport, hierarchy, guidance, sound and hardening browser tests | Keyboard, touch, 375px layouts, text parity, reduced motion and trace reset; PR #32 Firefox/WebKit automated QA passed, not manual assistive-technology validation |
| V-07/V-08 | Projection, hierarchy, layout and hardening unit fixtures | Stable IDs, no snapshot mutation, cycles, self-links and boundary provenance |
| V-09 | Hierarchy-performance and release-hardening unit fixtures | Prints sample compile/layout times and heap deltas; **no calibrated latency threshold** |
| R-01–R-06 | Remark, MDX, parser-boundaries and isolated packed tests | Safe literal MDX, source diagnostics, root/Remark React isolation |
| R-07–R-09 | Framework, hydration and unchanged-Markdown audits | Locked Fumadocs/Next/Astro/Markdown consumer fixtures, not deployed application |
| R-10–R-13 | Pack/license audits and independent host consumers | Shipped exports/types/license/dependencies and supported host adapters |

Durations and heap changes vary with runner hardware, JIT warm-up and GC.
Correctness invariants are asserted; a time-based CI regression cutoff
requires controlled repeat samples and a recorded baseline.

## Reader trust boundary

The React player rejects unsupported trace versions and missing `frames`
arrays before reading playback state. **This is not a full validator for
arbitrary deserialized snapshots.** Hosts should use the bounded public
compiler or separately validate external serialized trace data. Authored
labels, notes and values remain inert React text, not HTML. Untrusted
executable MDX outside these literal source attributes is a separate
host security concern.

## Gates still open

- **V-10:** perform a real participant-comprehension comparison against
  matched static material (structure, transfer and failure cause) and
  record the questions, methodology, answers and findings.
- **TL-I11 / RMK-10:** integrate a released package in the separate
  `documentation` app, preserve existing Remark plugins and verify the
  actual application. Packed framework fixtures alone cannot close it.
- Automated Firefox/WebKit suites passed on PR #32's fix head; manual
  cross-browser, real-device, audio and assistive-technology checks are pending.
- Proposed Remark and hierarchical compatibility decisions in `context`
  require explicit review and acceptance.
- Historical public-source rights review, release versioning, signed
  maintainer approval, package staging and publication are separate gates.

**Status:** Source hardening candidate. TL-I16 remains open until the
applicable outstanding acceptance and release gates are resolved.
