# Migrate from Throughline v0.1.x to v0.2.0

Throughline v0.2.0 is an intentional **breaking change**. It replaces domain-specific schema-1 programs with one schema-2 `VisualArtifact` model. There is no automatic conversion layer, compatibility parser or old React player export.

**Availability:** This guide documents the v0.2.0 source candidate. Check `npm view @0xbuff/throughline version` before installing; release approval and publication are separate from merging the implementation.

## Before upgrading

1. Pin the existing application to its current published version and save representative authored examples and expected playback outcomes.
2. Use Node.js 24+ and ESM. For UI applications, use React 19 and React DOM 19.
3. Identify every old domain-tagged Markdown fence, schema-1 `Program` or `Trace` object, `compile`/`compileProgram` call, and `ThroughlinePlayer` use.
4. Decide which former implied behaviors are **actually evidenced**. The new model requires explicit state writes and message phases, not merely visual movement or narrative text.

## API changes

| v0.1.x | v0.2.0 |
| --- | --- |
| Domain-tagged `thl flow`, `thl binary`, `thl matrix`, `thl callstack` and similar fences | One plain `thl` fence containing strict `VisualArtifact` JSON or reviewed prose |
| Schema-1 programs and traces | `VisualArtifact` with `schemaVersion: 2` |
| `compile`, `compileProgram` and domain-specific helpers | `parseArtifactJson`, `validateArtifact`, `compileArtifact` and `inspectTrace` |
| Schema-1 React `ThroughlinePlayer` | `ThroughlineGraphPlayer` with a compiled schema-2 trace |
| Old MDX source prop and source-specific embed logic | `ThroughlineEmbed` with inert `artifactJson` |
| Domain-specific inferred display behavior | Explicit write, topology, message and observation events; shared graph/sequence/state-table projections |

## Rewrite the source, not just the fence label

A schema-1 body cannot be made valid by renaming the fence to `thl`. Build a schema-2 artifact that declares:

- **Origins:** where each event's evidence came from (authored, computed, simulated, observed or AI-proposed).
- **Entities and relations:** stable IDs for modeled things and connections.
- **Initial state:** a known JSON value or an explicit unknown cell for each entity.
- **Steps:** named, ordered events. Only `write` and modeled `topology` events change committed state; `message` and `observation` events remain evidence.
- **Optional claims and view hints:** sources for statements and preferences for presentation, without changing facts.

Start from the [counter example](../README.md#quick-start-compile-and-inspect-a-trace) or the four [reference artifacts](catalog.md). Run `thl validate path/to/artifact.json` to check its grammar and semantics. For JSON Markdown blocks, use an unqualified `thl` fence and run `thl check path/to/docs`.

## Replace React and Markdown integration

~~~tsx
import { compileArtifact } from "@0xbuff/throughline";
import { ThroughlineGraphPlayer } from "@0xbuff/throughline/react";
import "@0xbuff/throughline/styles/throughline.css";

const trace = compileArtifact(yourSchema2Artifact);
export function TraceView() {
  return <ThroughlineGraphPlayer trace={trace} />;
}
~~~

Replace the old Remark plugin configuration with the v0.2.0 `remarkThroughline` contract. In MDX mode, register `ThroughlineEmbed` in the host's component map. It receives *literal validated JSON*, not an executable expression. See [framework integration](framework-integrations.md).

For prose fences, prepare a schema-2 artifact separately and run `thl materialize` to create a hash-bound **unreviewed** sidecar entry. An editor must compare source and artifact and explicitly change its status to `reviewed` in a separate review; `thl check` rejects unresolved or stale prose. The CLI does **not** generate models or call AI.

## Verify the migration

Compile and inspect each migrated model at its initial, intermediate and final frames. Assert expected values and event IDs, especially distinctions between unknown and known null, messages and writes, and authored versus observed facts. Test the selected Graph/Sequence/State-table views, keyboard navigation, focus and reduced motion where React is used. Finally, run a packed-version consumer check, not just development-source tests.

If schema-1 rendering must remain available in an application, keep that application on its existing published v0.1.x dependency until the migration is complete. Do not expect v0.2.0 to load legacy files.

For a compact overview of changed behavior, see [v0.2.0 release notes](release-notes-v0.2.0.md). Package version `0.2.0` and artifact `schemaVersion: 2` are independent numbers.
