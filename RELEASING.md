# First npm publication — Throughline v0.0.1

**This is the first release of `@0xbuff/throughline`.** The npm
organization `0xbuff` already exists, but the Throughline package
does **not**. GitHub source is public and `publish.yml` is merged.
The intended first functional release is `0.0.1`, with npm provenance.

**Release flow:** create npm package registration → bind GitHub OIDC →
sign version tag → run the existing GitHub release workflow → approve
the staged version using npm 2FA.

No npm access token, direct `npm publish` or functional `0.0.0`
publication is required.

## 1. Register the new package (one time only)

From a local terminal authenticated as the owner of the `0xbuff` npm
organization, verify:

~~~sh
node --version              # Node 24 is recommended for this repository
npm --version               # Must be npm 11.15.0+ for staged publishing
npm whoami                  # Expected: sezugh
npm org ls 0xbuff           # Expected: sezugh - owner
~~~

If npm is too old, use a supported Node.js version and update to the
current compatible npm 11 release, for example `npm install -g npm@11`.
Do not run registration from `/mnt/c/WINDOWS/system32`.

From the local Throughline clone's root, create a **temporary,
nonfunctional registration package** with no code:

~~~sh
cd /path/to/throughline
test -f LICENSE && test -f COPYRIGHT.md
BOOTSTRAP="$(mktemp -d)"
cat > "$BOOTSTRAP/package.json" <<'JSON'
{
  "name": "@0xbuff/throughline",
  "version": "0.0.0",
  "description": "Nonfunctional npm registration only",
  "private": false,
  "license": "Apache-2.0",
  "files": ["README.md", "LICENSE", "COPYRIGHT.md"],
  "publishConfig": { "access": "public" }
}
JSON
printf '# Registration only\n\nNONFUNCTIONAL. Do not install.\n' > "$BOOTSTRAP/README.md"
cp LICENSE COPYRIGHT.md "$BOOTSTRAP/"
(cd "$BOOTSTRAP" && npm pack --dry-run)
~~~

**Inspect the dry-run list.** It should contain just
`package.json`, `README.md`, `LICENSE` and `COPYRIGHT.md`
(and no source/compiler code, secrets or dependencies).

Only when satisfied with those contents, perform the one-time
registry registration:

~~~sh
(cd "$BOOTSTRAP" && npm stage publish --access public)
npm stage list @0xbuff/throughline
~~~

This is a **real public registry write**. npm automatically creates
the public `0.0.0-stage` package placeholder. It holds the temporary
`0.0.0` candidate in staging but does not make that candidate
installable. **Never approve that nonfunctional candidate.** You may
delete your local temporary bootstrap directory afterward. The
existing repository stays at version `0.0.1`.

Sources: [npm staged publishing](https://docs.npmjs.com/staged-publishing/),
[October 2026 new-package registration](https://github.blog/changelog/2026-10-02-npm-staged-publishing-now-supports-creating-new-packages/).

## 2. Configure GitHub environment and npm OIDC

1. In [Throughline GitHub Environments](https://github.com/0xbuffdev/throughline/settings/environments),
   create an environment named **`npm-publish`**. Require approval
   from the actual sole maintainer account; do not enable
   **Prevent self-review**. Restrict allowed deployment branches to
   `main`. Protect signed version tags `v*` against replacement/deletion.
2. Open npmjs.com → **Packages → @0xbuff/throughline → Settings →
   Trusted Publishing → GitHub Actions**. Enter **exactly**:

   | npm Trusted Publishing field | Value |
   | --- | --- |
   | Organization/user | `0xbuffdev` |
   | Repository | `throughline` |
   | Workflow filename | `publish.yml` |
   | GitHub environment | `npm-publish` |
   | Allow stage publish | Yes |
   | Allow direct publish | **No** |
   | Allow dist-tag changes | **No** |

   Use the workflow **filename only**, not
   `.github/workflows/publish.yml`. Configure shortly before first
   staging: a new trust must validate its first successful publish
   within **two days** or expire.

3. Use npm package **Publishing access → Require 2FA and disallow
   tokens**, once Trusted Publishing is configured. OIDC still works
   with this restriction; no `NPM_TOKEN` GitHub secret is needed.

Official: [npm Trusted Publishers](https://docs.npmjs.com/trusted-publishers/).

## 3. Sign the actual v0.0.1 source

After reviewing source rights, third-party notices and security,
and confirming the merged `main` CI is green:

~~~sh
git switch main
git pull --ff-only
git tag -s v0.0.1 -m "Throughline v0.0.1"
git tag -v v0.0.1
git push origin v0.0.1
~~~

Confirm the tag is shown as **Verified** on GitHub. The workflow
refuses lightweight/unsigned tags and rejects a tag pointing outside
main. Do not move this tag after creating it.

**Existing public history warning:** an old commit contains a private
planning reference (see `PUBLIC_SOURCE_HISTORY.md`). Its potential
exposure is not undone by current source checks. Audit historical
refs and artifacts, and rotate credentials if any are exposed.
Confirm rights to distribute the current code under Apache-2.0.

## 4. Run the provenance-staging workflow

On GitHub [Actions](https://github.com/0xbuffdev/throughline/actions),
select **Throughline npm release (staged with provenance)** and
**Run workflow**, from branch **`main`**:

- Tag: `v0.0.1`
- Confirmation: `STAGE-0.0.1`

The workflow validates the signed tag, runs the entire compiler,
browser, TypeScript, licensing, packed Node/SSR and Vite/hydration
test matrix, then creates one SHA-256-checked npm archive.

Inspect the verification artifact and approve the waiting
**`npm-publish` GitHub environment**. The protected stage job
rechecks the **same archive** and executes
`npm stage publish ... --provenance` via **GitHub OIDC**, with no npm
write token. This puts the functional `0.0.1` into **npm staging**,
not the live registry. Do not manually run `npm publish`.

## 5. Publish v0.0.1 with your npm 2FA

On npmjs.com → **Staged Packages**, choose the
**functional `@0xbuff/throughline@0.0.1`** entry. Inspect the
staged artifact and provenance, then **Approve** using account 2FA.
Alternatively, from your authenticated terminal:

~~~sh
npm stage list @0xbuff/throughline
npm stage view <actual-stage-id>
npm stage download <actual-stage-id>
npm stage approve <actual-stage-id>
~~~

The first three commands review; **the final command is the actual
public release**. Do not approve the `0.0.0` bootstrap candidate.
After successful `0.0.1` publication, reject the unused
`0.0.0` stage with npm 2FA.

## 6. Verify completion

~~~sh
npm view @0xbuff/throughline@0.0.1 version
npm view @0xbuff/throughline dist-tags
~~~

In a **fresh** consuming project with Node 24+, install
`@0xbuff/throughline@0.0.1` and verify the four public exports,
then run `npm audit signatures` from a project with its npm
lockfile. The npm package page should display verified **GitHub
provenance** and identify the source repository, commit and
GitHub Actions workflow.

Only after those checks should the README and CHANGELOG be updated
from “pending publication” to “released.” No additional CLI,
version bump or second npm publish is needed for this first release.

If OIDC fails, check **exact npm package scope**, trusted-publisher
repo/workflow/environment matching, public GitHub visibility,
environment approvals, and `id-token: write` on the staging job.
Do not fall back to an unreviewed token.

## References

- [npm staged publishing](https://docs.npmjs.com/staged-publishing/)
- [npm Trusted Publishing](https://docs.npmjs.com/trusted-publishers/)
- [npm stage CLI](https://docs.npmjs.com/cli/v11/commands/npm-stage/)
- [GitHub Environments](https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments)
