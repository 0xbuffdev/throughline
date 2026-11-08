# Initial npm registration candidate

**Status: preview-only. No registration, stage, approval or publishing is
authorized.**

npm owner confirmed by the maintainer's authenticated output:
`npm whoami` returned `sezugh`, and `npm org ls 0xbuff` returned
`sezugh - owner`. This establishes the intended npm organization and
account membership; it does **not** confirm account 2FA status or public
package-name availability.

The main `@0xbuff/throughline` package remains version `0.0.0` and
`private: true`. The independent runtime implementation is **not** part
of this bootstrap candidate.

## What is prepared

Run `node scripts/prepare-registration.mjs` from the repository root,
using Node 24 and an npm CLI installation. This **only packs files
locally** into ignored `registration-preview/`:

- A separate, explicitly public registration-only manifest with name
  `@0xbuff/throughline`, version `0.0.0`, Apache-2.0, zero scripts,
  zero runtime dependencies, no exports and public scoped access;
- An unmistakable README saying the candidate does not work and must
  not be installed;
- The official Apache-2.0 `LICENSE` and owner-designated `COPYRIGHT.md`;
- SHA-256 checksum and candidate status metadata outside the tarball.

The generator asserts the actual source manifest is **still private**,
then uses `npm pack` (not stage/publish). It inspects the packed archive
and fails if any other files, scripts, dependencies or exports are present.

The dedicated workflow `registration-preview.yml` runs this generator
under read-only GitHub permissions and uploads the nonfunctional archive
for **seven days**. It never authenticates to npm or requests OIDC.

## Registration is a separate authorized operation

npm staged publishing has supported new-package registration since
October 2026. Staging the initial candidate creates a **publicly visible
`0.0.0-stage` placeholder**; only the submitted version's contents
remain inaccessible until separately approved.

**Before authorizing such an operation**, I must:

1. Confirm npm 2FA is enabled by checking the `two-factor auth` field
   in `npm profile get` (do not share tokens or recovery codes);
2. Recheck the npm package name, scope and current staged versions
   using authenticated npm access;
3. Confirm the copyright holder's legal ownership/redistribution
   authority, release notices and security audit;
4. Independently download/review the exact registration archive and
   verify its checksum against the preview workflow;
5. Explicitly authorize the public npm registration-stage action.

After authorization only, an authenticated maintainer could use
`npm stage publish <exact-reviewed-tarball> --access public` with
npm CLI 11.15.0+. The exact command, flags, stage ID and consequences
must be reconfirmed against npm's current documentation before use.
**Do not approve the nonfunctional staged version.**

A registered package can then receive its separately approved, stage-only
GitHub OIDC Trusted Publisher configuration. The functional
`@0xbuff/throughline@0.0.1` release remains a different reviewed
candidate, signed tag, and human 2FA approval.

Official docs:
- https://docs.npmjs.com/staged-publishing/
- https://docs.npmjs.com/cli/v11/commands/npm-stage/
- https://docs.npmjs.com/trusted-publishers/
- https://docs.npmjs.com/managing-your-profile-settings/
