# The `thl` command-line tool

The `thl` executable helps authors validate schema-2 JSON, prepare **unreviewed** materializations for descriptive Markdown, and check documents before publication. It runs locally under Node.js 24+. It does not execute Markdown/MDX, generate a diagram from prose, call AI, or approve its own output.

The command is included in the **v0.2.0 source candidate**; check npm availability before installing that version.

## Commands

~~~sh
# Check a schema-2 artifact and its replay semantics.
thl validate artifacts/counter.json

# Create/update the sidecar record for an existing prose fence.
thl materialize --document content/counter.mdx --ordinal 0 \
  --artifact artifacts/counter.json --manifest throughline/manifest.json

# Check every thl block in one file or an entire directory.
thl check content --manifest throughline/manifest.json

# Direct schema-2 JSON fences need no manifest.
thl check content/inline-only.mdx

thl help
~~~

Add `--root /absolute/trusted/repository` to specify the content root. Otherwise the root is the current working directory. All other paths must be **root-relative POSIX paths**; `.` is allowed for the directory target when checking the root. Absolute paths, traversal, aliases, encoded separators, symlinks and unsafe paths are rejected.

## Write a prose materialization safely

A prose block is an editorial request, not an executable program:

~~~thl
Explain a counter changing from zero to one, with an explicit write.
~~~

To use it, first **author and review** a separate schema-2 JSON artifact that models the requested facts. `materialize` finds the chosen `thl` code node by its **zero-based ordinal** (counting only `thl` nodes), normalizes line endings to LF, and records SHA-256 digests of the exact prose and the canonical validated artifact.

The resulting manifest has this shape:

~~~json
{
  "version": 1,
  "entries": [{
    "document": "content/counter.mdx",
    "ordinal": 0,
    "intentSha256": "<64 lowercase hex characters>",
    "artifactPath": "artifacts/counter.json",
    "artifactSha256": "<64 lowercase hex characters>",
    "review": "unreviewed"
  }]
}
~~~

The output deliberately sets `review` to `unreviewed`, including when a previously reviewed entry is regenerated. An editor must compare the source with the materialized artifact, check assumptions, provenance and correctness, and **separately** change the manifest entry to `reviewed` in source control. There is no `thl approve` command.

Run `thl check` after review. It rejects unreviewed, missing, stale or tampered materializations. A body whose first non-whitespace character is `{` always takes the **strict JSON** path: invalid JSON is not reinterpreted as prose.

## Document discovery and diagnostics

`check` parses real CommonMark and MDX syntax trees without evaluating code. Nested fences in lists, blockquotes and MDX containers are included; lookalike strings inside HTML comments, JavaScript expressions or JSX attributes are ignored. Every matching `thl` code node is checked in document order. Metadata such as `thl flow` is invalid.

Successful checks report the file, one-based line and column, zero-based ordinal and total checked documents and blocks. Failures return a nonzero exit and stable `THL_*` codes such as `THL_UNREVIEWED`, `THL_DIGEST`, `THL_PATH`, `THL_ARTIFACT_SYNTAX`, `THL_ARTIFACT_REFERENCE` and `THL_ARTIFACT_LIMIT`. Filesystem exceptions do not expose private host paths in diagnostic messages.

## Use the trusted Node host with Remark

~~~ts
import { createNodeThroughlineHost } from "@0xbuff/throughline/node";
import { remarkThroughline } from "@0xbuff/throughline/remark";

const host = createNodeThroughlineHost({
  root: "/absolute/trusted/repository",
  manifestPath: "throughline/manifest.json",
});
const plugin = [remarkThroughline, { mode: "mdx", ...host }];
~~~

The Node host maps actual VFile paths to confined document keys and loads only reviewed artifacts from the trusted root. For an inline-JSON-only site, omit `manifestPath`. The Remark plugin still validates the model and creates an inert literal `artifactJson` property for a separately registered React component.

The content root must be selected by the trusted application, not by the authored document. The Node host uses bounded UTF-8 reads, realpath checks and atomic manifest writes; it rejects symbolic-link traversal. See [framework integrations](framework-integrations.md), [grammar](grammar.md), and the [schema contract](schema-v2.md).
