# Publishing Throughline with npm provenance

Status: the GitHub source at https://github.com/0xbuffdev/throughline
is PUBLIC. The manifest is a publishable @0xbuff/throughline@0.0.1
(public access, Apache-2.0, Copyright 2026 0xBUFF). The npm registry
status of version 0.0.1 has NOT been independently verified. Do not
claim a live npm release until the exact version and provenance are
confirmed on npm.

The manual `.github/workflows/publish.yml` verifies a signed version
tag, runs all tests, packs a checksum-verified archive, and submits
that archive via GitHub OIDC to npm STAGING. It NEVER calls
`npm publish` and NEVER approves a stage. The maintainer must review
and publish a staged version with separate npm 2FA approval.

## 1. Resolve ownership and source exposure

Before live publication, verify legal source ownership/redistribution
rights, Apache-2.0 notices, third-party attribution, and the absence
of sensitive material from the shipped archive.

IMPORTANT: this repository was made public while the original Git
history still retained a private planning reference in an old AGENTS.md.
See `PUBLIC_SOURCE_HISTORY.md`. Assume historical material may have
been accessed; inspect all old commits, public refs and artifacts.
If credentials or other secrets were exposed, revoke/rotate them.
Moving a repo back to private or rewriting main does NOT guarantee
earlier third-party copies or caches are erased. Do not misrepresent
this Git history as clean merely because source CI is green.

## 2. Verify npm package registration

From an authenticated local terminal, run:

~~~sh
npm whoami
npm org ls 0xbuff
npm view @0xbuff/throughline version
npm view @0xbuff/throughline@0.0.1 version
npm stage list @0xbuff/throughline
~~~

The maintainer previously confirmed ownership of the npm 0xbuff
organization and configured 2FA. If the registry reports 0.0.1
already published, it is IMPOSSIBLE to publish the same immutable
version a second time with provenance. Use a later separately reviewed
version and update all hardcoded first-release checks.

If the npm package does not yet exist at all, create a minimal,
separate bootstrap candidate before configuring Trusted Publishing.
In a clean temporary directory outside this source checkout, create
only these four reviewed files:

- `package.json`: name `@0xbuff/throughline`, version `0.0.0`,
  `private: false`, `license: Apache-2.0` and
  `publishConfig.access: public`, no dependencies/exports/scripts.
- `README.md`: explicitly say NONFUNCTIONAL, DO NOT INSTALL.
- `LICENSE`: copy the approved Apache-2.0 license.
- `COPYRIGHT.md`: copy the reviewed 0xBUFF attribution.

Inspect the exact contents using `npm pack --dry-run`. Only after
separate explicit authorization for this public registry action,
run from that isolated directory:

~~~sh
npm --version                  # must be 11.15.0 or newer
npm stage publish --access public
~~~

For a new package, npm creates a PUBLIC `0.0.0-stage` placeholder.
The functional 0.0.1 code is NOT part of the bootstrap. Never
approve the nonfunctional 0.0.0 stage; it is registration-only.
Skip the bootstrap entirely if the package already exists.

## 3. Create the protected GitHub environment

In this public repository, use Settings > Environments > New environment:

- Name exactly: `npm-publish`.
- Required reviewer: YOUR actual GitHub maintainer account.
- Do NOT enable Prevent self-review when you are the only reviewer:
  it would prevent you from approving the job you initiated.
- Restrict deployment branches to `main`. The workflow is dispatched
  from main; it checks out the signed tag only after validating inputs.
- Set a GitHub Ruleset for version tags matching `v*` to prohibit
  deletion/retargeting and restrict creation to the maintainer.

IMPORTANT: referencing an environment name in YAML does not itself
configure reviewers. Complete the protection rules BEFORE dispatching
the release workflow.

## 4. Configure npm Trusted Publishing (OIDC)

After a real npm package exists (including an initial placeholder),
open that package on npmjs.com > Settings > Trusted Publishing,
select GitHub Actions and enter the exact values:

| npm setting | Value |
| --- | --- |
| Organization or user | `0xbuffdev` |
| Repository | `throughline` |
| Workflow filename | `publish.yml` |
| GitHub environment | `npm-publish` |
| Allow npm stage publish | Yes (always allowed) |
| Allow direct npm publish | NO |
| Allow npm dist-tag | NO |

The workflow filename is ONLY `publish.yml`, not the full path.
GitHub-hosted runners use short-lived OIDC; DO NOT create or add
an NPM_TOKEN or bypass-2FA token. Grant OIDC only to the protected
stage job. Configure a newly created npm trust relationship shortly
before its first use: the first successful publish must validate
the relationship within TWO DAYS or it expires.

With GitHub OIDC and public source/package, npm automatically
generates provenance. The staged-publish command also explicitly
requests `--provenance`. Once trust is established, prefer npm
package Settings > Publishing access > Require two-factor authentication
and disallow tokens. This does not disable OIDC Trusted Publishing.

## 5. Merge release workflow, then sign and push the tag

After PR review/signing/merge and green main CI, confirm the exact
v0.0.1 source contents, licenses and release notes. In a clean
checkout with a signing key registered and verified on GitHub:

~~~sh
git switch main
git pull --ff-only
git tag -s v0.0.1 -m "Throughline v0.0.1"
git tag -v v0.0.1
git push origin v0.0.1
~~~

GitHub must show the ANNOTATED tag signature as Verified.
The release workflow rejects unsigned/lightweight tags, tags whose
commit is not on main, versions other than the reviewed 0.0.1,
and tag commits without the publish.yml file.

Protect the tag and do not retarget or re-create it after staging.
Do not create v0.0.1 if an immutable published/staged 0.0.1 already
exists in the registry; first resolve any existing stage/version.

## 6. Submit with GitHub Actions (not a direct release)

GitHub > Actions > Throughline npm release (staged with provenance)
> Run workflow:

- Dispatch from branch `main`.
- Tag: `v0.0.1`.
- Confirmation: `STAGE-0.0.1`.

The read-only verify job validates the GitHub-verified signed tag,
frozen pnpm dependencies, source/license audits, TypeScript,
compiler tests, Chromium browser behavior, build, packed
Node/TypeScript/SSR consumers and Vite hydration. It creates a
tarball, checksum and release-commit marker, then uploads them for
review.

Review the build output. Approve the waiting `npm-publish` GitHub
environment job. The stage job downloads the SAME exact artifact,
checks the SHA-256 and release commit, then uses npm 11.21.2
on a GitHub-hosted runner with OIDC to run:

~~~sh
npm stage publish ./release-artifacts/throughline-0.0.1.tgz --access public --provenance
~~~

The stage submission does not make version 0.0.1 live. If OIDC fails,
check npm publisher organization/repository/workflow/environment
case and status, OIDC permissions, repo public visibility and the
two-day trust-validation window. Never silently substitute a token.

## 7. Inspect, approve using npm 2FA, and verify provenance

From npmjs.com > Staged Packages or an authenticated npm CLI:

~~~sh
npm stage list @0xbuff/throughline
npm stage view <stage-id>
npm stage download <stage-id>
~~~

Inspect the functional staged archive, source commit, license,
content and provenance. Verify it matches the GitHub workflow's
published SHA-256 review artifact. Then, and ONLY then, approve
the FUNCTIONAL 0.0.1 stage with npm 2FA:

~~~sh
npm stage approve <stage-id>
~~~

Do not approve the nonfunctional registration-only 0.0.0 stage.
Reject the unused bootstrap stage after successful functional release.

After approval, verify:

~~~sh
npm view @0xbuff/throughline@0.0.1 version
npm view @0xbuff/throughline dist-tags
npm install @0xbuff/throughline@0.0.1
npm audit signatures
~~~

Run the signature audit from a fresh consumer with a package
lockfile. On npmjs.com, check the green provenance badge and its
source commit, GitHub workflow run and public transparency ledger.
The actual public installation and registry checks determine
whether the release is complete.

Finally update README and CHANGELOG to reflect real publication,
and migrate private consumers to the released pinned package.
The npm version and the Trace/Program schema v1 remain independent.

## Official documentation

- https://docs.npmjs.com/staged-publishing/
- https://docs.npmjs.com/cli/v11/commands/npm-stage/
- https://docs.npmjs.com/trusted-publishers/
- https://docs.npmjs.com/viewing-package-provenance/
- https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments
