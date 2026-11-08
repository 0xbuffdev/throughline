# Pre-public Git history exposure review

Status: **Unresolved visibility blocker**  
Scope: private standalone Throughline repository, not its released npm artifact.

## Verified finding — November 8, 2026

The initial source-extraction commit `ccd888e648cd` retains an
`AGENTS.md` reference to a private planning repository (line 7),
and references to the internal host/application context (lines 9–10).
The later source audit commit `8ac305f215d9` removes those references
from the latest `AGENTS.md`. **It does not erase the old commit.**

The GitHub repository's main history included 24 commits at the
time of this review. A new public viewer can normally inspect
historical commits and their blobs, not just the current branch tip.
The historical private planning reference would therefore be
discoverable if this exact repository were made public unchanged.

The old reference is not a credential by itself, but it is a private
architecture/planning disclosure. This is a **confirmed historical
exposure**, not proof that all other historical paths or files are safe.

**Do not mark this issue resolved** because current-file source checks,
lockfile checks, CI, or the public npm registry preflight pass.

## Recommended resolution

Use a separately approved **clean-public-source cutover**:

1. Keep this private repository as the internal audit/PR archive.
   Review its *entire* history, tracked files, tags, PR refs,
   workflows and release candidates for sensitive references,
   credentials, third-party source or unowned content. If real
   credentials are discovered, rotate/revoke them before proceeding.
2. Review the complete current source tree for public distribution
   and copyright/third-party rights. Do not copy internal Git history.
3. With maintainer authorization, establish a clean public repository
   containing only a newly reviewed initial source snapshot and
   deliberately authored public metadata. Preserve the intended
   canonical URL (`0xbuffdev/throughline`) by planning a repository
   rename/new-repository cutover; **do not rename, fork, force-push,
   delete old refs or change visibility automatically**.
4. Reconcile the fresh public repository's `repository.url`,
   release tags, CI credentials, npm Trusted Publisher binding,
   provenance and existing documentation links. The public release
   workflow must run from that exact approved public repository
   and a reviewed immutable signed source revision.
5. Independently verify that the resulting public repository's
   accessible history, branches, tags and artifacts contain no
   private references. Confirm provenance and the new public URL.
   Record the public cutover commit/verification in the release
   checklist before enabling stage/publish.

Alternatively, history rewriting and GitHub Support-assisted
purging may be examined, but **branch rewriting alone is not
sufficient evidence** that historical commits, PR refs or cached
data are inaccessible. Do not treat unreachable Git objects as
guaranteed deleted by simply replacing `main`.

## Independence from npm registration

The separate nonfunctional `0.0.0` registration tarball was
packed from four reviewed files and does not include this Git history.
Its **staging** is still a public npm action requiring explicit
permission, even though it does not itself require making the
Throughline source repository public.

The **functional `0.0.1` release** requires a clean, public source
repository before claiming GitHub OIDC npm provenance. Do not reuse
a rehearsal archive checksum as a claim about a future live release.

## Open decisions

- Who legally owns or is authorized to license every extracted source
  and documentation element under the 0xBUFF brand?
- Is a clean public repository cutover approved? This includes the
  exact URL, preservation of the private PR audit history, and the
  canonical GitHub/npm release binding.
- Is the separate **public npm registration stage** explicitly
  authorized after scope ownership, 2FA, and candidate review?

Until those decisions and checks are complete: **repository remains
private; no registration, functional stage or publication is authorized.**
