# Upgrading Throughline from v0.0.2 to v0.1.0

This guide describes the upgrade from the previously published v0.0.2.
Verify that v0.1.0 is available on npm before installing it.
`Program.version` and `Trace.version` remain `1`, but npm SemVer
is separate from the trace schema and visual/API compatibility still matters.

## 1. Confirm the package and integration boundary

For a clean application consumer, use Node.js 24+ and ESM. Keep React 19
and React DOM 19 installed only where the optional player is rendered.
Pin `@0xbuff/throughline@0.1.0` in the consumer's lockfile **after**
the package is actually available, and verify the five supported public
imports. Do not import `dist/` or `src/` internals.

The compiler at `@0xbuff/throughline` is still React-free. The
Remark entry point `@0xbuff/throughline/remark` is an opt-in,
React-independent build-time integration, not an automatically enabled
Markdown renderer. The React entry point adds optional
`ThroughlineEmbed` and `ThroughlineScenarios`.

## 2. Review authored traces and compatibility

Existing `thl flow` programs can continue to use flat groups and the
same version-1 snapshot format. Optional syntax
`group "System" id system as column` and
`group "Worker" id worker under system as row` introduces hierarchy.
**v0.0.2 compilers do not parse that new syntax**, so do not publish new
hierarchical content to older consumers.

Old readers can flatten optional group metadata instead of providing
collapse/drill-down. Do not assume that version-1 alone guarantees
visual feature parity across npm package versions. Retest authoring
diagnostics, strict work limits, seeking, visible group structure
and source-to-frame compatibility against production fixtures.

## 3. Review the React player and CSS

Import `@0xbuff/throughline/styles/throughline.css` explicitly once.
The default player shell, control layout, caption placement, corners
and visual emphasis have changed. Review any host CSS overrides rather
than copying assumptions from v0.0.2.

`--thl-active` now marks current activity and `--thl-trail` represents
past participation; `--thl-change` identifies changed values.
Test custom themes, light/dark/system modes, keyboard focus,
reduced-motion preferences, compact embeds and full-screen behavior.
Step details live in a disclosure below the player controls; integration
tests that targeted old DOM/layout structures may require updating
without weakening accessibility checks.

Sonification is opt-in via the optional `sonification` prop.
Caption narration is separately opt-in via the optional `narration` prop
and depends on the browser Speech Synthesis API. Test audio availability,
permissions, pause/resume, seeking, multiple player instances and
unmount on real target devices; mocked browser tests are insufficient.

## 4. Integrate Markdown/MDX explicitly

If using `remarkThroughline`, preserve existing Remark plugin order,
compile-time validation and expected MDX component registration.
For MDX, provide a host-owned React component mapping to
`ThroughlineEmbed` and import the stylesheet. The default Remark
mode validates without replacing Markdown nodes; opt-in MDX mode
creates literal-source component nodes. Other MDX expressions remain
executable host code, so use trusted MDX sources and enforce
document-wide workload limits.

See [framework integration examples](framework-integrations.md) for
host-specific configuration. Test the actual deployed host separately
from the provided packed fixture builds.

## 5. Validate security and rollout

Compiled source is bounded, inert state data; the React player is not a
complete validator for arbitrary external serialized `Trace` objects.
Validate external JSON at the host boundary or compile bounded source.

Before changing production documentation or other consumers, compare
actual example output and interactions against the pinned v0.0.2
baseline, review the [release procedure](releasing.md)
and take a rollback snapshot of dependency locks and host configuration.
Keep the previous working package version pinned until v0.1.0 is
explicitly approved and verified. If integration fails, revert the
consumer lockfile/version rather than rewriting an immutable npm release.
