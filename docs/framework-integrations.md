# Framework integrations

This guide covers the **unreleased TL-U08 schema-2 source**. Verify the
installed npm version before using it. The older v0.1.0 published package
has a different Markdown contract and does not receive a compatibility layer.

## One fence language

Author a plain **thl** code fence without a domain name or metadata. Its first
non-whitespace character determines the branch:

- An opening brace selects **strict JSON** representing a schema-2 VisualArtifact.
  The complete artifact is parsed, validated and compiled offline. Duplicate
  keys, unsupported versions, unsafe Unicode, inconsistent references and
  semantic replay errors fail the build, never falling back to prose.
- Any other nonempty body is **descriptive intent**, not an executable
  simulation. It requires an exact, editor-reviewed sidecar artifact. Without
  reviewed materialization, building fails; no automatic AI/network call is made.
- Empty or whitespace-only content is rejected.

A complete direct example:

~~~thl
{
  "schemaVersion": 2,
  "id": "counter",
  "origins": [{ "id": "author", "kind": "authored" }],
  "entities": [{ "id": "counter", "label": "Counter" }],
  "relations": [],
  "initialState": { "counter": { "status": "known", "value": 0 } },
  "steps": [{
    "id": "increment",
    "label": "Increment",
    "events": [{
      "id": "change",
      "originId": "author",
      "type": "write",
      "entityId": "counter",
      "path": [],
      "value": { "status": "known", "value": 1 }
    }]
  }]
}
~~~

The same typed schema can bypass Markdown:

~~~ts
import { resolveThlBody, compileArtifact, inspectTrace } from "@0xbuff/throughline";
const artifact = resolveThlBody(jsonFenceBody); // offline; no manifest
const query = inspectTrace(compileArtifact(artifact));
~~~

The root authoring API and the Remark adapter do not import React or providers.

## Reviewed prose materialization

A prose fence could instead contain:

~~~thl
Explain the checkout retry. Distinguish sent and received events.
~~~

The host supplies an approved version-1 manifest whose entries have exactly
these fields: document, ordinal, intentSha256, artifactPath, artifactSha256,
review. For example, document can be content/docs/checkout.mdx and ordinal 0
is the first thl node in depth-first mdast order. The source hash is lowercase
SHA-256 of the normalized-LF **mdast code-node body**, including its ordinary
leading/trailing spaces. The artifact hash is SHA-256 of the canonical,
sorted-key validated artifact JSON. Both are 64-character lowercase hex.

Only an entry with review equal to "reviewed" can be published. The marker
records editorial approval, not independent proof of real-world truth. The
document and artifact paths must be repository-relative, traversal-safe POSIX
paths. A trusted host loader must also confine IO to the content root and reject
symlink escapes; the pure engine never accesses the filesystem itself.

~~~ts
import { resolveThlBody } from "@0xbuff/throughline";

const artifact = resolveThlBody(proseBody, {
  document: "content/docs/checkout.mdx",
  ordinal: 0,
  manifest, // loaded and approved by the host
  loadArtifact: (relativePath) => loadApprovedArtifact(relativePath),
});
~~~

A wrong source hash, mismatched canonical artifact hash, missing entry or
unreviewed entry always fails closed. The creation/check CLI and filesystem
integration are scheduled separately under TL-U10.

## Remark and MDX

The official optional entry is @0xbuff/throughline/remark. In validate mode,
it checks every thl mdast node and leaves Markdown unchanged, including other
code languages, math and Mermaid. It emits file, ordinal and source-header
position where known. It verifies the complete document before any MDX mutation.

~~~ts
import { remarkThroughline } from "@0xbuff/throughline/remark";

const plugin = [remarkThroughline, { mode: "mdx" }];
// A host building prose may additionally pass manifest, document and
// loadArtifact. An inline JSON fence does not need them.
~~~

In explicit MDX mode each valid fence becomes a registered ThroughlineEmbed
element with **one inert, literal artifactJson string attribute**. No authored
JavaScript expression, dynamic import, HTML injection or provider call is
generated from trace data. Register ThroughlineEmbed from
@0xbuff/throughline/react in the host component map; it uses the native
schema-2 ThroughlineGraphPlayer internally. Import the stylesheet once from
@0xbuff/throughline/styles/throughline.css. The old v1 source prop is **not**
accepted by the new bridge.

A plain Unified Remark pipeline can use validate mode and remark-stringify
to preserve the code nodes. Host plugins should preserve unrelated Remark,
rehype, math and Markdown/MDX transformations.

## Framework-specific setup

**Fumadocs Unified / React Router:** append the MDX-mode Remark plugin to the
existing configuration's remarkPlugins array. Keep remark-math, Mermaid and
rehype-katex. Map ThroughlineEmbed in the MDX components registry. The separate
Sätteri backend does not run Remark.

**Next.js App Router:** register the plugin with @next/mdx in next.config,
enable .mdx pages, and map ThroughlineEmbed from a "use client" component in
mdx-components. Include styles in the app layout. Test server rendering and
hydration, not only compilation.

**Astro:** use the @astrojs/markdown-remark Unified processor with the
@astrojs/mdx plugin and @astrojs/react. An Astro wrapper forwards artifactJson
to a React ThroughlineEmbed island with client:load. Import the CSS once.
Astro's default Sätteri pipeline cannot run this Remark plugin.

**mdx-bundler:** preserve any existing remarkPlugins and add the plugin in
MDX mode. Register ThroughlineEmbed in the resulting component map. MDX itself
is executable JavaScript, so bundle and evaluate only trusted MDX documents.

**react-markdown:** use validate mode and a host-owned Remark adapter that
attaches validated serialized artifact JSON to ordinary code nodes. Override
the native pre renderer to render ThroughlineEmbed with artifactJson. Do not
use MDX mode, rehype-raw or dangerouslySetInnerHTML for the player.

**markdown-to-jsx:** this host has no Remark integration. A host-owned
codeBlock rule for exact language thl can call the pure resolveThlBody and
serializeArtifact functions, then supply artifactJson. Do not hide domain
tags in the body.

Source-only independent packed consumers for these hosts reside in
scripts/audit-frameworks.mjs and scripts/fixtures/markdown-hosts. They are
regression proof for the tested versions, not a blanket claim about all hosts.
