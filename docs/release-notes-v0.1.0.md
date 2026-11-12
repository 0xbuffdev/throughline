# Throughline v0.1.0

Throughline compiles Markdown-authored state transitions into deterministic,
step-by-step traces. This release expands the optional React player and adds
build-time Markdown integration without introducing a backend or requiring
React for the compiler.

## Highlights

- **State visualization:** React-independent scene projection, hierarchical
  groups with collapse/drill-down, activity trails, and bounded pan, zoom and
  follow-active navigation.
- **Guided playback:** accessible chapters, authored evidence and explanations,
  scenario comparison, responsive controls, state inspection and native
  fullscreen.
- **Optional audio:** independent step tones and speech narration. Both are
  opt-in; narration depends on the host browser's speech synthesis support.
- **Markdown and MDX:** source-positioned Remark validation, optional literal
  MDX components and a `ThroughlineEmbed` React bridge.
- **Integration:** independent package-consumer coverage for Fumadocs Unified,
  Next.js App Router, Astro and common Markdown renderers.
- **Reliability:** improved reduced-motion handling, WebKit toolbar layout,
  narration interruption/ownership, touch gestures and trace validation.

## Installation

~~~sh
npm install @0xbuff/throughline@0.1.0
~~~

Use Node.js 24+ and ESM. The optional React player requires React 19 and
React DOM 19; its CSS must be imported explicitly.

## Compatibility

The five supported v0.1.0 package exports are `.`, `./remark`, `./react`,
`./examples` and `./styles/throughline.css`. Program and trace schema
versions remain **1**. New optional group hierarchy syntax is not parsed by
the v0.0.2 compiler, and older players may flatten nested groups. Player
layout and CSS defaults have also changed, so hosts with theme overrides or
DOM-dependent tests should review the new presentation.

See the [v0.0.2 → v0.1.0 migration guide](migration-v0.1.0.md),
[complete changelog](../CHANGELOG.md) and [usage guide](user-guide.md)
for integration instructions and details.
