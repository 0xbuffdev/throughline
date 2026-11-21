# Mermaid feasibility dependency inventory

The TL-U26 experiment pins Mermaid **12.3.0 as a development dependency**. It does not change package exports, runtime dependencies, the player renderer, or the shipped archive. Run `pnpm build` followed by `node scripts/audit-mermaid-proof.mjs` to verify that separation and generate the installed dependency/license inventory. The committed lockfile identifies exact resolved dependencies.

The initial inventory contains 115 installed packages reachable from Mermaid's declared dependencies, including type packages. Every package has a license text file. Declared expressions include MIT, ISC, BSD-3-Clause, Apache-2.0, Unlicense, DOMPurify's `(MPL-2.0 OR Apache-2.0)`, and ELK's `EPL-2.0 OR GPL-3.0-or-later`. Khroma 2.1.0 has no manifest license declaration; its installed `license` file contains the MIT license and the Fabio Spampinato/Andrew Maney attribution. The audit preserves that distinction instead of silently treating its metadata as MIT.

Mermaid's own license is MIT with Knut Sveidqvist's attribution. Installed DOMPurify 3.4.18 includes Apache and MPL texts. Installed elkjs 0.12.1 includes the Eclipse Public License 2.0 text. Production adoption must preserve the applicable notices and source-availability information in the actual distributed dependency/asset tree; the existing runtime audit's MIT-only allowlist does not approve this new tree. The inventory and file hashes are technical evidence, not legal approval or publication authorization.

The distributed minified ELK chunk alone is 1,620,399 bytes, or 509,479 gzip bytes in the initial inventory. The main Mermaid entry is 30,936 bytes, or 11,660 gzip bytes, and the Sequence chunk is 118,899 bytes, or 31,989 gzip bytes. These are individual upstream files, **not** a complete application bundle measurement: shared and transitively imported chunks add work. Do not advertise the tiny flowchart entry chunk as the total flowchart cost. A production adoption requires an independently built packed React host and its actual initial/lazy asset footprint.

No icon pack, external font, CDN, remote image, callback, or network service is configured by the experiment. Browser measurements reject non-local resource requests. That is separate from downloading dependencies during development installation.

See the [feasibility report](mermaid-feasibility.md) for renderer findings and outstanding adoption gates.
