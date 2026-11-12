# Throughline v0.1.0 — draft release notes

**Draft only. v0.1.0 is not yet published.** The final notes must describe
the exact approved signed commit and verified package archive.

## Highlights

- **More expressive state visualization:** React-independent scene
  projection, optional nested group hierarchies, controlled group
  collapse/drill-down, bounded pan/zoom and follow-active navigation.
- **A clearer optional React player:** responsive light/dark/system
  themes, persistent activity trail, native fullscreen, accessible
  timeline and Details disclosures, chapter guidance and comparisons
  between independent scenarios.
- **Two separate, opt-in audio features:** per-step synthesized tones and
  caption speech narration with coordinated browser speech ownership.
  Neither uploads authored source from Throughline or enables sound by default;
  browser speech services may operate outside Throughline's control.
- **Build-time Markdown integrations:** optional
  `@0xbuff/throughline/remark` validation/MDX transformation and
  `ThroughlineEmbed`, plus tested integration patterns for Fumadocs
  Unified, Next.js, Astro and common Markdown renderers.
- **Reliability:** stronger reader guards, deterministic scene/trace
  regression tests, source and package audits, packed consumer checks
  and Firefox/WebKit browser QA alongside Chromium.

## Public API and migration

The package continues to support only
`@0xbuff/throughline`, `@0xbuff/throughline/remark`,
`@0xbuff/throughline/react`, `@0xbuff/throughline/examples`,
and `@0xbuff/throughline/styles/throughline.css`.
The root compiler remains independent of React, DOM and network services.
React 19 is an optional peer; Node 24+ is required.

`Program.version` and `Trace.version` are still **1**. New optional
hierarchy grammar is **not** understood by the old v0.0.2 compiler,
and older viewers may flatten the new hierarchy. Visual/CSS defaults
and player control placement also change. Review
[the upgrade guide](migration-v0.1.0.md) before adopting the new package,
especially if customizing player CSS or compiling external documents.

## Verification and approval boundary

Normal CI for the prior merged `main` passed at `2b713bf`; PR #32
passed its Chromium, Firefox and WebKit suites. These are not the same
as a signed v0.1.0 release or proof of real-device/screen-reader
acceptance. See [release readiness](release-readiness-v0.1.0.md) for
evidence, unclosed acceptance gates, and publication controls.

The publisher uses an immutable GitHub-verified signed tag and manual
OIDC staged npm publishing with human 2FA approval. Nothing here
authorizes tag creation or publication.

For the technical change history, see the [changelog](../CHANGELOG.md).
