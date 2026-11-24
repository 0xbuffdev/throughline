# Throughline architecture

Throughline turns authored, evidence-linked state changes into a deterministic timeline that readers can inspect. The source of truth is a **schema-2 `VisualArtifact`**, not a domain-specific language or executable program. Its compiler and inspection APIs work without React, a browser, an AI provider or a network connection.

The separately exported Node CLI and filesystem host add only build-time responsibilities. They cannot change the semantics of the core artifact. Nothing in this architecture supports the previous version-1 `Program` or `Trace` public APIs.

## From source to a view

1. **Author.** A `VisualArtifact` declares stable entity, relation, group and origin IDs, initial known or unknown cells, and ordered steps. Each step contains named write, topology, message or observation events. Prose, model comments and relations do not themselves cause state changes.
2. **Validate.** `validateArtifact` or `parseArtifactJson` checks strict schema-2 data, uniqueness and references, topology, permissible JSON values and bounded size and work. Unsupported schema versions and malformed or duplicate-key JSON fail rather than being adapted.
3. **Compile.** `compileArtifact` commits each modeled step atomically, beginning from an explicit initial frame. It produces immutable `CompiledTrace` frames; messages and observations are evidence only, never implicit writes.
4. **Inspect.** `inspectTrace` serves indexed state-at-frame, entity history, source-event lookup, changes and declared causal dependencies. A missing acknowledgment stays missing; an unknown cell never becomes known because the diagram implies it.
5. **Project.** `projectView` creates source-linked graph, sequence and state-table descriptors from that same compiled truth. `projectInspection` produces the Explain/Inspect data model. Projection cannot invent an event or mutate a trace. A sequence request without message evidence falls back to an honest state table.
6. **Present.** `ThroughlineGraphPlayer` (`./react`) renders responsive views, playback and inspection. `ThroughlineEmbed` receives inert, validated `artifactJson` from Markdown/MDX and compiles it into the same player. The optional React 19 peer, CSS, browser narration and screen interactions belong here rather than in the core.

```text
thl source (strict JSON or reviewed prose sidecar)
              |
   validation of VisualArtifact (schema 2)
              |
   compileArtifact — immutable CompiledTrace
              |
        inspectTrace
          /       \
    projectView   projectInspection
          \       /
        React 19 player / host-owned rendering
```

There is **one canonical artifact**. Graph, sequence, state-table, inspector, captions and comprehension text present that artifact; they do not supply alternative transition systems. Every meaningful result must be traceable to declared source events.

## Universal Markdown and MDX authoring

A Markdown code node has exactly one recognized language: an **unqualified `thl` fence**. No `thl flow`, `thl matrix`, `thl binary`, `thl bindings` or `thl callstack` dispatch remains in the published interface.

A body beginning with `{` is strict schema-2 JSON and validates offline without a manifest. Otherwise the body is inert descriptive intent: the host must supply a separately reviewed `VisualArtifact` with matching document-relative POSIX path, zero-based `thl` ordinal, normalized-LF intent SHA-256 and canonical artifact SHA-256. Invalid, missing, tampered or unreviewed sidecars fail closed. A malformed JSON-looking body is never reclassified as prose.

`remarkThroughline` (`./remark`) consumes actual mdast `code` nodes in depth-first order. It validates all matching nodes before rewriting any. In `mode: "mdx"` it replaces them with inert `mdxJsxFlowElement` nodes containing **literal `artifactJson` attributes**, not executable expressions or imports. The host registers `ThroughlineEmbed` itself. Unrelated code blocks, math, Mermaid and other MDX elements remain host-owned.

The standalone `thl` Node CLI reads the same code-node semantics using a non-evaluating Markdown/MDX syntax tree. `thl validate` checks a model file; `thl materialize` records exact intent/artifact digests as **unreviewed**; `thl check` validates every discovered `thl` node and requires a separately reviewed matching sidecar for prose. It cannot approve generated artifacts, execute source text or invoke an AI provider.

## Public package boundaries

| Import | Purpose | Dependencies |
| --- | --- | --- |
| `@0xbuff/throughline` | Schema-2 validation, compilation, indexed queries, canonical hashing and projection | Pure TypeScript/ESM; no Node IO, React, DOM or network |
| `@0xbuff/throughline/remark` | Read actual mdast nodes; validate or replace with literal MDX data | Host-provided Remark/MDX tree; no React |
| `@0xbuff/throughline/node` | Trusted content-root mapping, safe artifact loading and strict manifest parsing | Node 24+ filesystem; parser packages are confined to this entry |
| `@0xbuff/throughline/react` | `ThroughlineGraphPlayer` and `ThroughlineEmbed` | Optional React 19 peer |
| `@0xbuff/throughline/examples` | Four typed schema-2 mathematical/engineering references with questions and evidence | Pure core only |
| `@0xbuff/throughline/styles/throughline.css` | Explicitly imported, namespaced presentation styles | CSS |
| `thl` (executable) | Offline validation, unreviewed materialization, and build-time check | Node 24+; not imported from the pure root |

The published API intentionally **does not** export `parseThl`, `compileProgram`, domain-specific tracers or `ThroughlinePlayer`. Historical version-1 source and tests, where still present during cleanup, are internal regression scaffolding only. They are neither a supported import nor a conversion layer. The npm package version is separate from `VisualArtifact.schemaVersion = 2`.

## Trust and failure boundaries

The pure validator rejects unsupported shapes, unsafe values, invalid references and resource-budget overruns; the compiler rejects conflicting writes and nested replacements that would produce a value deeper than the 32-segment query ceiling. Optional arrays must be omitted or actual arrays (not null). Canonical UTF-8 size is charged during data detachment, before encoding; the strict JSON decoder constructs owned data directly under one 1,000,000-unit counter (one visited value and one per property/slot), without a second full parse or detachment. Object input uses the same accounting, preserving round-trip admission without increasing the traversal ceiling. Raw UTF-8 input and canonical UTF-8 output are separately capped. Arbitrary in-memory objects already exist in caller memory, and Reflect.ownKeys must enumerate a record before incremental checks; this is not a heap quota or a sandbox for JavaScript proxies. Manifest array slots must be enumerable own data values. A source `message:sent` is not evidence of `received`, `processed`, `acknowledged` or a persistent write. An authored claim cites explicit evidence, and assumptions stay marked as assumptions.

The Node host alone owns filesystem access. A trusted repository root determines allowed paths, while untrusted Markdown cannot choose a loader or root. The host verifies relative POSIX locators, rejects symlink traversal and reads files with bounded UTF-8 decoding. Materialized sidecar entries cannot be approved by the generating command; reviewed digests are verified again at check/build time. Diagnostics use stable codes and locations when available without reflecting host exception secrets. Markdown/MDX syntax parsing does not execute embedded JavaScript, JSX, HTML or prose.

React is optional. Player seeking selects immutable compiled frames; switching layouts, collapsing groups, viewport navigation, playback and optional narration cannot change compiled truth. Controls preserve keyboard, reduced-motion and accessible-status behavior. Browser speech synthesis may be provided by the user's browser/OS; it is never a core inference or artifact-authoring service. SSR and hydration must agree on their initial markup; browser-only capability detection happens after mount.

## Repository ownership and verification

- `src/v2/` owns validation, replay, source-linked queries, projection, authoring and hash contracts.
- `src/remark/` owns the host-neutral mdast transform; `src/node/` owns Node-only safe file loading and CLI syntax-tree discovery; `src/cli/` owns command argument, diagnostic and review behavior.
- `src/react/` owns the native player and inert-data embedding; `src/reference/` and `src/examples.ts` own public reference evidence; `src/styles/` owns presentation tokens.
- `src/domains/` and other older files may remain only for non-public historical regression tests until their separately reviewed cleanup.
- `scripts/` tests package exports, compiler integrity, real Node/MDX/React consumers, SSR/hydration, framework integrations, boundaries and licenses. A source-only unit test does not establish published runtime behavior.

The npm archive must be checked from an **independent installation**, including its `thl` binary, Node-only consumer without React, optional Remark integration, React SSR/hydration and representative MDX hosts. No successful CI check authorizes publication: signed releases, staged package verification and documentation rollout remain separate maintainer-approved actions.

See [schema-2 semantic contract](schema-v2.md), [one-fence grammar](grammar.md), [CLI and human review](cli.md), [framework integration](framework-integrations.md), [reference explanations](reference-traces.md) and [release procedure](releasing.md).
