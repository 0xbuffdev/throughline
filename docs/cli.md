# Offline authoring and validation CLI (TL-U10)

The first-party `thl` binary is a **Node.js 24+** build tool. It
validates and materializes schema-2 models, without calling an AI provider,
running Markdown/MDX as code, importing React or accessing the network.
The candidate CLI is currently unreleased source. Use it only from a
reviewed checkout or after its package version has been published.

## Commands

~~~sh
# Validate one strict VisualArtifact JSON file and its replay semantics:
thl validate artifacts/counter.json

# Record a prose fence's source digest and artifact digest:
thl materialize \
  --document content/docs/counter.mdx \
  --ordinal 0 \
  --artifact artifacts/counter.json \
  --manifest throughline/manifest.json

# Check direct-JSON and reviewed-prose fences in a document or directory:
thl check content/docs --manifest throughline/manifest.json
# Direct-JSON-only content needs no --manifest:
thl check content/docs/inline-only.mdx
~~~

Use `--root /trusted/repository` with any command to select an
explicit trusted repository root. If omitted, the CLI's current working
directory is the root. **All document, artifact and manifest paths are
repository-relative POSIX paths**: no absolute paths, traversal, empty
segments, percent-encoded aliases or backslashes. The directory target
`.` means the root itself.

### What materialize does

The CLI locates the requested prose `thl` Markdown/MDX code node by
its zero-based ordinal, **counting only `thl` code nodes** in the
document. It normalizes the code-node body from CRLF/CR to LF without
trimming other content, then computes:

- `intentSha256`: SHA-256 over UTF-8 bytes of that exact normalized body.
- `artifactSha256`: SHA-256 over canonical validated and fully compiled
  schema-2 artifact JSON (independent of source JSON formatting).

The operation creates or replaces one ordered, duplicate-free version-1
manifest entry with `"review": "unreviewed"` **every time**. Even
re-materializing an unchanged, previously reviewed model resets review.
It can never generate an approved entry, edit the authored document or
silently invoke a provider.

Example generated manifest:

~~~json
{
  "version": 1,
  "entries": [
    {
      "document": "content/docs/counter.mdx",
      "ordinal": 0,
      "intentSha256": "<64 lowercase hex>",
      "artifactPath": "artifacts/counter.json",
      "artifactSha256": "<64 lowercase hex>",
      "review": "unreviewed"
    }
  ]
}
~~~

### Separate human approval

A maintainer must compare the actual model to its prompt, verify facts,
scope and provenance, and review the JSON artifact, hash and intended
document. **Only then**, in a distinct source-control change, set
`review` from `unreviewed` to `reviewed` and submit the manifest
for peer review. There is deliberately **no `thl approve` command**.

The published-build `thl check` refuses unreviewed entries, stale
source digests, altered artifact digests, unsupported manifest shapes,
duplicate locators and unsafe paths. Direct strict JSON fences require
no sidecar, review entry or provider. An opening brace selects JSON
unconditionally; malformed JSON cannot silently become prose.

### What check does

The CLI walks `.md` and `.mdx` files in deterministic path order,
parses a **non-evaluating CommonMark/MDX syntax tree** (Remark with
MDX syntax enabled for `.mdx` documents), then validates each actual
`thl` code node in depth-first order. This includes fences under nested
list items, blockquotes and JSX containers. Strings resembling `~~~thl`
inside HTML comments, JavaScript code, MDX expressions or JSX attributes
are not code nodes and never acquire ordinals. Unrelated JavaScript,
math and Mermaid remain ordinary Markdown. Unqualified fences alone are accepted; domain
metadata such as `thl flow` fails. Each success reports its document,
one-based source line and column and zero-based `thl` ordinal;
the final summary reports documents and validated blocks.

The check command fails closed with a nonzero exit for invalid, missing
or unreviewed materializations, invalid JSON, model semantics, unsafe
filesystem paths and IO errors. It emits stable `THL_*` error codes
(e.g. `THL_UNREVIEWED`, `THL_DIGEST`, `THL_PATH`,
`THL_ARTIFACT_SYNTAX`, `THL_ARTIFACT_REFERENCE`,
`THL_ARTIFACT_CONFLICT`, `THL_ARTIFACT_LIMIT`).
The origin/line/ordinal appear when genuinely known; the checker does
not print private host loader exception details.

### Host filesystem security

Node reads are scoped to a real trusted content root, use bounded UTF-8
decoding, disallow symbolic-link traversal in both directories and
files, reject unsafe relative locators and write manifests via
exclusive temporary files and atomic rename. The host configuration
defines the root; Markdown cannot choose it or a loader callback.

The separate Node entry point makes the same boundary available for
real Remark/MDX hosts:

~~~ts
import { createNodeThroughlineHost } from "@0xbuff/throughline/node";
import { remarkThroughline } from "@0xbuff/throughline/remark";

const host = createNodeThroughlineHost({
  root: "/absolute/trusted/repository",
  manifestPath: "throughline/manifest.json",
});
const throughlinePlugin = [remarkThroughline, { mode: "mdx", ...host }];
~~~

For documents containing only inline schema-2 JSON, omit
`manifestPath` and use the same host. The host's real VFile paths
are mapped to reviewed repository-relative document locators. The
Remark adapter still consumes actual mdast nodes and emits only inert
literal `artifactJson` for the separately registered React component.

See [framework integrations](framework-integrations.md),
[semantic model](schema-v2.md) and the
[reference truth suite](../src/__tests__/examples.test.ts).

## Release boundaries

The CLI/Node host source does not publish a package or authorize
deployment. The package release belongs to TL-U19. The live
documentation-app upgrade belongs to TL-U20 and must use a verified
published version. The proposed first schema-2 package is 0.2.0,
pending separate availability and release approval.
