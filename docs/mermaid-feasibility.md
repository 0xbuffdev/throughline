# Mermaid renderer feasibility

TL-U26 tests Mermaid 12.3.0 against Throughline's existing schema-2 projections. Mermaid integration is scheduled before 0.2.0 publication. Release, publication and real assistive-technology acceptance remain separate actions.

Run `pnpm dev` to try the Mermaid renderer in the compact player. Its adapter and viewport live in `src/react/mermaid/`. The playground injects that renderer into the same shell used by the package React entry. The standalone feasibility host remains under `src/react/__tests__/mermaid-proof/`.

## Decisions supported by the prototype

Graph uses `flowchart LR` or `flowchart TB`, native subgraphs, explicit edge IDs and host-selected styles. Source mapping preserves individual and collapsed relation IDs and removed-member evidence. Labels show short descriptions rather than cell JSON. The unchanged semantic model remains available through source controls and inspection.

Sequence uses explicit participants from the complete modeled message participant set, even at frame zero. Only explicit sends produce outbound `-)` arrows. Recorded received, acknowledged and processed phases produce separate notes. The preview lets readers page through windows of 40 message phases. Changes and evidence independently pages through the full event log and shows correlation counts. While the next diagram is being drawn, the player keeps the lane boundaries visible and hides the previous frame's arrows and notes.

Graph and Sequence use a single forward cue along the rendered path for an explicit send. The preview drives cues with the existing `usePlayer` actions and respects seeking, pause, speed, view changes and reduced motion. Graph highlights authored focus, such as the factorial stack, independently of transfer animation. A write to that stack is evidence of the new stored value. A graphical push, pop or return between distinct calls requires the artifact to model those calls and relations explicitly.

## Findings that changed the adapter

**Layout must not run on every step.** Preliminary Chromium samples for the original prototype took approximately 0.43–0.51 seconds for 8 nodes/12 edges, 1.45–2.53 seconds for 64/160, and 14.93 seconds for 200/1,000. These were development-host samples with concurrent machine load, not a performance SLA or an exact final-head acceptance run. Native geometry alone was timed separately and is not the same operation as Mermaid's complete parse/layout/draw/serialize work. Repeated layout is unsuitable for ordinary stepping. The adapter now keeps graph syntax independent of current-frame emphasis; the component reuses geometry and retains at most three rendered structures. A browser regression requires exactly one renderer call across unchanged-topology forward/backward frames while verifying changed edge colors and current event selection.

**Legal artifact limits are not automatic diagram display limits.** The candidate refuses automatic rendering beyond 64 participants or 160 relations and retains paged source access. The standalone benchmark deliberately bypasses that display policy to measure legal near-limit graphs. That provisional display budget needs final packed-host measurements; it is not a new validator limit. Production fallback must reuse the player's native State table and complete event evidence, not merely the test host's source list.

**Explicit edge IDs do not solve DOM mapping by themselves.** Mermaid adds its own SVG prefix and does not retain supplied edge class names. The graph experiment assigns a distinct trusted paint token through documented `classDef` styling, checks that exactly one rendered route carries each token, and binds a host-owned item attribute and CSS variable. Missing or ambiguous mappings fail closed. Essential source selection resolves that attribute through the current descriptor, never through a generated SVG ID, an endpoint guess, label matching or coordinates. Entity mapping uses host-authored classes. Source controls remain available independently of SVG output.

**Sequence motion needs endpoint verification.** The version-pinned bridge checks the rendered arrow count and each route's from/to IDs against the generated send list before attaching motion markers. A mismatch disables motion. Participant selection uses explicit actor IDs and the exact event records are available through the source inspector.

**Message captions can move lanes.** Chromium measured a 26 CSS-pixel shift in checkout when the first send rendered with a longer caption. Compact captions and fixed base participant widths removed that shift in a repeat through all 20 checkout frames. An integrated regression exercises three lanes before any messages, through a send and receipt, and after a backward seek.

**Escaping and wrapping must be tested together.** SVG-only flowchart labels initially displayed decimal escapes literally. The tested candidate uses Mermaid's generated HTML labels under `securityLevel: "strict"`; author text is still escaped and cannot supply markup. Sequence automatic wrapping split internal entity escapes. The adapter instead wraps plain text before escaping and emits only fixed host-owned line breaks. The punctuation regression includes quotes, apostrophes, angle brackets, ampersands and literal entity-looking input. Hostile labels must never produce scripts, images, links or event-handler attributes.

## Outstanding cutover gates

| Area | Current evidence and remaining work |
| --- | --- |
| Four canonical references | Pure graph source conservation across every frame and actual browser rendering. Non-message references correctly have no fabricated Sequence sends. |
| Hierarchy and presence | The preview uses current-presence layout. A union-layout trial retained absent edges and changed collapsed labels as constituents changed. Verify the preview camera across topology changes before cutover. |
| Geometry | Unchanged-topology seek is tested. Narrow hosts retain readable diagram units and scroll rather than shrinking text arbitrarily. Topology changes can relayout and need an explicit production camera policy. |
| Sequence lanes | The three-lane regression and full checkout example preserve actor positions through initial state, sends and later phases. Final legibility and window-boundary measurements remain open. |
| Motion | Forward Graph and Sequence cues are exercised through the compact player transport. Production cutover still needs the full transport and lifecycle exercise on the packed player. |
| Accessibility | Keyboard source selection, exact text controls, SSR/initial hydration and error fallback are tested. Actual screen-reader output and native browser zoom have not been performed. |
| Cost and dependencies | Pinned development dependency, installed license inventory, preliminary measurements and bounded render policy. Final application initial/lazy bundle, memory and packed candidate rendering are not yet established. |
| Production UI | The local playground runs the Mermaid renderer with the compact layout and responsive sheets. The public package entry continues to use the tested native renderer pending parity review. |

This is **not approval to delete the existing renderer or claim TL-U26 complete**. A reviewed go/no-go must distinguish the proven adapter pieces from the remaining production gates. TL-U27–TL-U29 implement the accepted replacement on focused branches. No source ticket is closed merely because this report or a local test exists.

## Reproducing the evidence

Use Node 24 and pnpm 11.2.2 with the committed lockfile:

```sh
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test:run --maxWorkers=1
pnpm test:browser:run src/react/__tests__/mermaid-proof
THROUGHLINE_QA_BROWSER=firefox pnpm test:browser:run src/react/__tests__/mermaid-proof
THROUGHLINE_QA_BROWSER=webkit pnpm test:browser:run src/react/__tests__/mermaid-proof
pnpm build
node scripts/audit-mermaid-proof.mjs
pnpm audit:pack
```

For the development-only visual/measurement host, run `pnpm exec vite --host 127.0.0.1 --port 5174`, then open `/scripts/mermaid-proof.html`. `node scripts/measure-mermaid-proof.mjs chromium` captures graph, initial Sequence, send and mobile screenshots, source/dirty status, engine version, topology/width/actor observations, synthetic workload timings and non-local resource attempts. Firefox and WebKit are alternate arguments. Run from a clean, committed head for exact-source evidence; a dirty result is explicitly marked. Output defaults to a temporary directory, and `THROUGHLINE_PROOF_URL` selects another local host.

If the machine's temporary filesystem lacks space, set `TMPDIR` to a task-owned directory on a disk with capacity; do not remove unrelated work. The original full-suite boundary test exceeded its five-second timeout under concurrent browser/package workloads. Its targeted rerun and the complete 399-test run with one worker passed. Preserve failed attempts when reporting verification; do not change the validator or its limits to hide a test-runner timeout.

The [dependency inventory](mermaid-dependencies.md) describes licensing and the limits of individual chunk-size measurements. Mermaid's [flowchart](https://mermaid.js.org/syntax/flowchart.html), [Sequence](https://mermaid.js.org/syntax/sequenceDiagram.html) and [configuration](https://mermaid.js.org/config/usage.html) documentation are the upstream syntax/API references.
