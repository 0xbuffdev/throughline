# Mermaid renderer feasibility

TL-U26 tests Mermaid 12.3.0 against Throughline's existing schema-2 projections. Stable production Mermaid integration is required before 0.2.0 publication: TL-U26 feasibility and reviewed go/no-go → TL-U27 Graph → TL-U28 Sequence → TL-U29 production cutover → final exact-candidate TL-U18 automated and real assistive-technology acceptance → TL-U19 verified publication. TL-U20 documentation-app adoption follows publication. The preview does not satisfy these gates. If mandatory parity fails, retain the native renderer during development and block publication until corrected or a reviewed maintainer decision changes the requirement.

Run `pnpm dev` to try the Mermaid renderer with the checkout reference in the compact player. Its adapter and viewport live in `src/react/mermaid/`. The playground injects that renderer into the same shell used by the package React entry. The standalone feasibility host remains under `src/react/__tests__/mermaid-proof/`.

## Decisions supported by the prototype

Graph uses `flowchart LR` or `flowchart TB`, ELK, native subgraphs, explicit edge IDs and the player's theme tokens. Compact node labels and current-route captions leave room for the connections. Earlier recorded sends retain the trail color up to the current step. Seeking recomputes the trail from authored history. Source mapping preserves individual and collapsed relation IDs and removed-member evidence. Source inspection keeps exact labels and state available.

Sequence reserves lanes for every modeled message participant from the initial step. Its compact rows scroll inside the player, with pinned participant headers. The viewport follows the current event vertically and follows an animated arrow horizontally when its endpoints cannot fit together. Each explicit send produces a `-)` arrow in its declared direction, including a separately modeled reply. Received, acknowledged and processed phases use notes. The original route can appear as context while inspecting a later phase for that message. Earlier sends keep their trail color. Readers can page through windows of 40 message phases or use the Sequence log for the full event list and correlation counts. An initial load shows the selected diagram's loading state. While appending rows, the preview retains the prior lanes and dims the previous rows until the updated diagram is ready.

Graph and Sequence use a single forward cue along the rendered path for an explicit send. The route and source appear first, and destination emphasis follows the cue. A recorded receive, processing or acknowledgment gives static context. The preview drives cues with the existing `usePlayer` actions and respects seeking, pause, speed, view changes and reduced motion. Graph follows routes and keeps the camera in place while an active route fits or the step has only local changes. The candidate also exposes bounded projected value/presence, focus and write indicators in a source-linked Graph state strip; node borders mark focus/writes without rerendering geometry. This is an alternative presentation experiment, not accepted equivalence to native inline values. State and Inspect retain exact evidence. A graphical push, pop or return between distinct calls requires the artifact to model those calls and relations explicitly.

## Findings that changed the adapter

**Layout must not run on every step.** Preliminary Chromium samples for the original prototype took approximately 0.43–0.51 seconds for 8 nodes/12 edges, 1.45–2.53 seconds for 64/160, and 14.93 seconds for 200/1,000. These were development-host samples with concurrent machine load, not a performance SLA or an exact final-head acceptance run. Native geometry alone was timed separately and is not the same operation as Mermaid's complete parse/layout/draw/serialize work. Repeated layout is unsuitable for ordinary stepping. The adapter now keeps graph syntax independent of current-frame emphasis; the component reuses geometry and retains at most three rendered structures. A browser regression requires exactly one renderer call across unchanged-topology forward/backward frames while verifying changed edge colors and current event selection.

**ELK stays in the preview.** A warmed Chromium comparison passed source bindings for both ELK and Dagre, including a nested collapse. For the checkout in top-to-bottom orientation, ELK used an 840-pixel-wide view box and Dagre used 1,475 pixels. The single 64-node/160-relation samples took 1.31 and 1.41 seconds respectively. Both created a scene over 12,000 pixels wide for that synthetic workload. These measurements support testing readable pan, authored focus and an explicit Fit action on dense graphs. They do not establish a general performance ranking.

**Legal artifact limits are not automatic diagram display limits.** The candidate refuses automatic rendering beyond 64 participants or 160 relations and retains paged source access. The standalone benchmark deliberately bypasses that display policy to measure legal near-limit graphs. That provisional display budget needs final packed-host measurements; it is not a new validator limit. Production fallback must reuse the player's native State table and complete event evidence, not merely the test host's source list.

**Explicit edge IDs do not solve DOM mapping by themselves.** Mermaid adds its own SVG prefix and does not retain supplied edge class names. The graph experiment assigns a distinct trusted paint token through documented `classDef` styling, checks that exactly one rendered route carries each token, and binds a host-owned item attribute and CSS variable. Missing or ambiguous mappings fail closed. Essential source selection resolves that attribute through the current descriptor, never through a generated SVG ID, an endpoint guess, label matching or coordinates. Entity mapping uses host-authored classes. Source controls remain available independently of SVG output.

**Sequence identity needs more than endpoint verification.** The next feasibility candidate adds explicit fixed-width `TL000000`-style display references to each generated message/phase caption. These are projected row references, not authored event IDs or timestamps. It reserves reference-shaped authored caption text before allocating unique window-scoped references, checks the allocated terminal token, route endpoints, expected order, caption adjacency and normal line vertical order before binding. Authored evidence and original source IDs are unchanged; display references may change between windows if a collision requires an alternate. Missing, duplicated or permuted references fail closed to State and complete evidence. The bridge still observes version-specific SVG structure for associating a route with its caption; no MR-04/MR-10 independence claim or production approval follows merely from this change. Review whether that bridge can be accepted or must be replaced. The exact event records are available through the source inspector and a bounded, host-owned Sequence source-reference disclosure independent of the generated SVG.

**Message captions can move lanes.** Chromium measured a 26 CSS-pixel shift in checkout when the first send rendered with a longer caption. Compact captions and fixed participant widths held the five lane positions across all 21 frames of the updated checkout at 375 and 1,280 CSS pixels. A 260-pixel regression exercises horizontal following for wide sends and replies. As a cue arrives, the viewport reveals the destination label.

**Escaping and wrapping must be tested together.** SVG-only flowchart labels initially displayed decimal escapes literally. The tested candidate uses Mermaid's generated HTML labels under `securityLevel: "strict"`; author text is still escaped and cannot supply markup. Sequence automatic wrapping split internal entity escapes. The adapter instead wraps plain text before escaping and emits only fixed host-owned line breaks. The punctuation regression includes quotes, apostrophes, angle brackets, ampersands and literal entity-looking input. Hostile labels must never produce scripts, images, links or event-handler attributes.

## Installed React prototype

A separate package prototype wired Mermaid into the public React entry and loaded
the pinned renderer after hydration. A Vite host installed its tarball and tested
Checkout in Chromium, Firefox and WebKit at 260–1,280 CSS pixels. The host hydrated
the server-rendered player, reserved the five initial Sequence lanes and opened
the exact transfer from both Graph and Sequence. The first checkout-only host
loaded 335 kB gzip through initial Sequence and another 497 kB opening Graph.

The next prototype showed State during startup and used the pinned Mermaid ESM
distribution alongside the host's ordinary Mermaid import. All three browsers
preserved the host's theme and rendered its standalone diagram. Both trials
blocked external resource requests and recorded zero attempts.

## Outstanding cutover gates

| Area | Current evidence and remaining work |
| --- | --- |
| Four canonical references | Pure graph source conservation across every frame and actual browser rendering. Non-message references correctly have no fabricated Sequence sends. |
| Hierarchy and presence | The preview uses current-presence layout. A union-layout trial retained absent edges and changed collapsed labels as constituents changed. The preview keeps the Follow transfers preference across topology changes and frames visible paths and both mapped endpoints. |
| Geometry | Unchanged-topology seek is tested. Narrow hosts retain readable diagram units and scroll rather than shrinking text arbitrarily. Topology changes can relayout and need an explicit production camera policy. |
| Sequence lanes | The three-lane regression and full checkout example preserve actor positions through initial state, sends and later phases. Final legibility and window-boundary measurements remain open. |
| Motion | Forward Graph and Sequence cues are exercised through the compact player transport. Production cutover still needs the full transport and lifecycle exercise on the packed player. |
| Accessibility | Keyboard source selection, exact text controls, SSR/initial hydration and error fallback are tested. Actual screen-reader output and native browser zoom have not been performed. |
| Cost and dependencies | The independent proof host at `6995747` loaded 799 kB gzip through its initial Graph and another 31 kB when it opened Sequence. The production-built playground starts in Sequence and loads ELK on opening Graph. Its offline smoke test blocked non-local requests and recorded zero attempts. Integrated package size and memory still need verification for cutover. |
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
node scripts/audit-mermaid-packed.mjs
THROUGHLINE_QA_BROWSER=firefox node scripts/audit-mermaid-packed.mjs
THROUGHLINE_QA_BROWSER=webkit node scripts/audit-mermaid-packed.mjs
```

For the development-only visual/measurement host, run `pnpm exec vite --host 127.0.0.1 --port 5174`, then open `/scripts/mermaid-proof.html`. `node scripts/measure-mermaid-proof.mjs chromium` captures graph, initial Sequence, send and mobile screenshots, source/dirty status, engine version, topology/width/actor observations, synthetic workload timings and non-local resource attempts. Firefox and WebKit are alternate arguments. Run from a clean, committed head for exact-source evidence; a dirty result is explicitly marked. Output defaults to a temporary directory, and `THROUGHLINE_PROOF_URL` selects another local host.

If the machine's temporary filesystem lacks space, set `TMPDIR` to a task-owned directory on a disk with capacity; do not remove unrelated work. The original full-suite boundary test exceeded its five-second timeout under concurrent browser/package workloads. Its targeted rerun and the complete 399-test run with one worker passed. Preserve failed attempts when reporting verification; do not change the validator or its limits to hide a test-runner timeout.

The [dependency inventory](mermaid-dependencies.md) describes licensing and the limits of individual chunk-size measurements. Mermaid's [flowchart](https://mermaid.js.org/syntax/flowchart.html), [Sequence](https://mermaid.js.org/syntax/sequenceDiagram.html) and [configuration](https://mermaid.js.org/config/usage.html) documentation are the upstream syntax/API references.

## TL-U26 candidate acceptance register (measured snapshot; not acceptance)

The proof below is deliberately development-only. The previously measured numbers above belong to earlier source revisions. A green source test cannot attest actual speech, manual zoom or production dependency distribution. The packed proof installs the native package and separately copies the experimental adapter; it is not proof that the public React package ships Mermaid.

### Measured head: ef82615193c90b348b4cae24d5191f5bbc3e1ee3

On 2026-11-25, all six checks passed for this exact clean source head: [compiler/Chromium/distribution](https://github.com/0xbuffdev/throughline/actions/runs/45571876230), [Firefox/WebKit regression suite](https://github.com/0xbuffdev/throughline/actions/runs/45571876175), and [three-engine feasibility evidence](https://github.com/0xbuffdev/throughline/actions/runs/45571876195). The measurements below are transcribed from the successful feasibility job logs, rounded to 0.1 ms. They describe the earlier measured revision only, not the subsequent review corrections.

| Engine | 8 entities / 12 relations render (ms; 3 samples) | 64 / 160 render (ms; 3 samples) | 200 / 1,000 render (ms; 1 sample) | 10,000 phases: projection / render of 40 (ms) |
| --- | --- | --- | --- | --- |
| [Chromium](https://github.com/0xbuffdev/throughline/actions/runs/45571876195/job/139060243206) | 66.0 / 52.5 / 50.3 | 426.6 / 398.3 / 372.5 | 5,734.6 | 48.9 / 52.4 |
| [Firefox](https://github.com/0xbuffdev/throughline/actions/runs/45571876195/job/139060243290) | 66 / 53 / 46 | 412 / 355 / 353 | 6,329 | 100 / 52 |
| [WebKit](https://github.com/0xbuffdev/throughline/actions/runs/45571876195/job/139060243357) | 87 / 66 / 68 | 522 / 470 / 428 | 5,780 | 86 / 93 |

Native geometry-only times were respectively 0.6/2.7/18.7 ms, 1/4/35 ms and 0/4/32 ms for those three Graph sizes; a 0 is timer resolution, not zero work. These timings are not equivalent operations or performance SLAs. All engines mapped 8/12, 64/160 and 200/1,000 nodes/edges, with finite reported view boxes of 956×70, 7,716×91 and 24,176×154. The largest serialized SVG was 2,548,432 / 2,576,500 / 2,556,490 bytes respectively. The 40-phase SVG was 64,509 / 64,515 / 64,509 bytes. The 200/1,000 case bypasses the preview display budget; its cost supports retaining bounded degradation rather than claiming acceptable interactive layout. Source measurements reported zero external requests and page errors. The packed native package plus copied adapter passed the then-current checks at 260/320/375/720px; the packed four-reference test at that revision checked source-list visibility, not the exact SVG/list round trip subsequently requested in review.

Artifact ZIP SHA-256 digests reported by GitHub Actions (each archive contains measurements, screenshots, source dependency inventory, and packed-host asset/geometry report):

| Engine | Retained artifact | SHA-256 |
| --- | --- | --- |
| Chromium | [15002447124](https://github.com/0xbuffdev/throughline/actions/runs/45571876195/artifacts/15002447124) | `7ec9474416a870635c7493a6708afa79f10cf48c8fb6efd0efefec4403e5482a` |
| Firefox | [15002551667](https://github.com/0xbuffdev/throughline/actions/runs/45571876195/artifacts/15002551667) | `89d61819b5e66f33915ba08a9b25c949225735dc27cc773f4283ea9baf7e557e` |
| WebKit | [15002127783](https://github.com/0xbuffdev/throughline/actions/runs/45571876195/artifacts/15002127783) | `716dbba811683c9be54cd6b9126ff8c6fb95dda8ef7878befa6c23f3a2cecfc7` |

These are GitHub-recorded archive digests, not independently recomputed member hashes. Engine versions, raw geometry, actual compressed asset measurements and file hashes are in the retained reports; only log-visible values are transcribed here. All three source dependency inventories reported no missing license texts; this is neither notice approval nor proof of the consumer's actual transitive resolution. The earlier independently installed npm consumer did not retain a lock, so its dependency tree is not reproducible from the pnpm lock. Subsequent review fixes retain the actual independently resolved consumer lock and per-package installed versions/license-file hashes, and assert exact packed source round trips. This remains a floating-consumer compatibility measurement with pinned top-level Mermaid, not a cross-engine identical dependency-tree benchmark; compare retained lock hashes before comparing packed costs. Fresh results for those changes are required.

| Requirement | Evidence at measured head | Disposition for cutover |
| --- | --- | --- |
| MR-01 | Passed pure package/import and copied-adapter packed proof | GO for isolated proof only; no public export change |
| MR-02 | Passed four-reference source/render tests and parallel/self-edge cases | GO for prototype syntax; no production adoption |
| MR-03 | Passed current-presence/collapse and removed-member evidence tests; union-layout negative case retained | GO for projected collapse experiment; production group interaction/camera parity still unaccepted |
| MR-04 | Passed existing row-reference/perturbation and geometry tests; review found authored-reference collision and packed round-trip gap | **NO-GO**: private SVG route association still essential; review fixes require fresh evidence |
| MR-05 | Passed modeled phases, duplicate receipt, orphan ack, ordering and window cases | GO for evidence grammar; NO-GO for production selection under MR-04 |
| MR-06 | Passed 40-phase window of 10,000 events, evidence navigation tests | GO for bounded proof; not an unbounded diagram claim |
| MR-07 | Passed native State/Inspect regressions | GO for retaining native State, not Graph inline parity |
| MR-08 | Passed automated motion/seek/pause/reduced-motion tests | GO for preview cues only; integrated packed player untested |
| MR-09 | Passed tested hostile labels, corrupted-output fallback, offline requests | GO for tested trust boundary; not general SVG tamper detection |
| MR-10 | Passed automated three-engine regressions/SSR and packed-host checks | **NO-GO**: pinned DOM association and actual AT/zoom outstanding |
| MR-11 | Actual workload results above; source license inventory; packed asset reports | **NO-GO**: no peak/process memory, accepted notices or integrated package; old consumer lock absent |
| MR-12 | Four references and negative/near-limit cases exercised; review found gaps | **NO-GO** overall; maintain native renderer and block release |

Per-area recommendation (maintainer decision still required):

- **Graph: NO-GO for cutover.** Syntax, finite geometry and source conservation support further investigation; the state strip is not accepted equivalence to native inline values/focus/writes.
- **Sequence: NO-GO.** Evidence grammar and windowing work on tested cases; exact route association is still dependent on private version-specific SVG structure and caption collisions were found in review.
- **Collapsed hierarchy: GO for the current-presence projection experiment only.** Union reuse failed absent/aggregate semantics; production collapse/expand interaction and camera parity must be demonstrated before adoption.
- **Exact ID/selection: NO-GO.** Graph tokens and independent source controls are promising, but the previous packed test did not assert exact IDs/values and the Sequence bridge is unaccepted.
- **Performance: NO-GO for production approval.** Repeated layout is unsuitable; retain preview limits and measured degradation. Integrated assets, peak/process memory and legibility are unresolved.
- **Browser safety: GO for the tested isolated automated proof only; NO-GO for production.** Three-engine and offline cases passed, but human AT/native zoom, production SSR/packed integration and dependency notices are not yet accepted.


The read-only Mermaid feasibility workflow captures browser-specific packed proof, workload measurements/screenshots and the dependency inventory as retained artifacts. Its browser suite is separate from final release acceptance. Browser heap snapshots are explicitly method-labeled (or unavailable); they do not establish peak process memory.

Record subsequent exact commit, engine versions, actual timings, asset hashes/bytes and failure outcomes; never replace missing measurements with estimates. No human AT or native zoom was performed for this candidate. The display-reference and Graph state-strip design choices require explicit review. Graph/Sequence/collapse/source selection/performance/browser safety each remain unaccepted until reviewed against the evidence. Do not start production cutover or publication on this report alone.
