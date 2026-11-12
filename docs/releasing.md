# Releasing Throughline

The package is distributed as [@0xbuff/throughline](https://www.npmjs.com/package/@0xbuff/throughline).
Each version is published from an immutable, GitHub-verified signed
`vX.Y.Z` tag using manual GitHub Actions OIDC staged publishing.
**The GitHub workflow only stages a release; npm 2FA approval publishes it.**

## Verification

Use Node.js 24+, pnpm 11.2.2 and the committed lockfile. Run the full
release suite on the exact reviewed revision:

~~~sh
pnpm install --frozen-lockfile
pnpm audit:source
pnpm typecheck
pnpm preview:typecheck
pnpm preview:build
pnpm test:run
pnpm exec playwright install chromium
pnpm test:browser:run
pnpm build
pnpm audit:licenses
pnpm audit:pack
pnpm audit:browser
pnpm audit:frameworks
pnpm audit:markdown-hosts
~~~

For Firefox and WebKit verification, install the browser binaries and run
`THROUGHLINE_QA_BROWSER=firefox pnpm test:browser:run` and
`THROUGHLINE_QA_BROWSER=webkit pnpm test:browser:run`. Verify the final CI
results and the packed tarball, not just a successful TypeScript build.

Validate browser/device appearance, keyboard and screen-reader interactions,
200%/400% zoom, reduced motion and opt-in speech/sound on the supported
platforms. Maintain recorded acceptance evidence for any release-specific
performance, comprehension or documentation-application integration
requirements. These checks are not replaced by mocked or fixture-only tests.

## Release checklist

1. Verify rights to distribute the source, applicable third-party notices,
   security reporting, release acceptance, compatibility and the final
   changelog. Review the public history for any sensitive references.
   Historical exposure cannot be undone by deleting current-tree files.
2. Update the version in `package.json` and document the changes in
   `CHANGELOG.md`. Maintain the five public package exports and keep
   `Program.version` / `Trace.version` independent of npm SemVer.
3. Run the source, TypeScript, preview, Chromium/Firefox/WebKit browser,
   build, license and packed consumer checks listed above.
   Record the exact candidate SHA, CI runs and applicable manual review.
   Review the exact archive contents. Merge the release PR after review and
   ensure main CI is green.
4. From a clean checkout with a signing key registered with GitHub, create
   and push an immutable signed tag **only after** the release commit is
   merged. For version `0.1.0`:

   ~~~sh
   git switch main
   git pull --ff-only
   git tag -s v0.1.0 -m "Throughline v0.1.0"
   git tag -v v0.1.0
   git push origin v0.1.0
   ~~~

   GitHub must show the tag as **Verified**. Protect `v*` tag updates and
   deletions. Do not move or reuse existing release tags.
5. In [GitHub Actions](https://github.com/0xbuffdev/throughline/actions),
   run **Throughline npm release (staged with provenance)** from `main`.
   Enter the exact signed tag (e.g. `v0.1.0`) and confirmation
   `STAGE-v0.1.0`. The read-only verification job checks the signed tag,
   manifest, build, tests, packed consumers and archive SHA-256.
6. Inspect the GitHub release artifact and approve the protected
   `npm-publish` environment job. Its **stage-only** Trusted Publisher
   uses GitHub-hosted OIDC and npm provenance, without an npm token or a
   direct `npm publish`. The npm connection must match GitHub
   `0xbuffdev/throughline`, workflow filename `publish.yml`,
   environment `npm-publish`; direct publishing and dist-tag writes
   must remain disabled.
7. Once the workflow succeeds, review the staged version and its archive
   through npmjs.com's **Staged Packages** page or:

   ~~~sh
   npm stage list @0xbuff/throughline
   npm stage view <stage-id>
   npm stage download <stage-id>
   ~~~

   Confirm the exact version, contents and provenance, then, with final maintainer authorization, approve
   **that stage only** with npm account 2FA:

   ~~~sh
   npm stage approve <stage-id>
   ~~~

8. Confirm the registry version, latest dist-tag, clean installation,
   public exports and npm provenance:

   ~~~sh
   npm view @0xbuff/throughline version
   npm view @0xbuff/throughline dist-tags
   npm view @0xbuff/throughline@0.1.0 version
   ~~~

   Check [npm's package page](https://www.npmjs.com/package/@0xbuff/throughline)
   for the provenance badge and linked source workflow. In a fresh npm
   consumer with a lockfile, run `npm audit signatures`.

## Operational safeguards

- `publish.yml` is manual-only and uses the version from the signed
  tag and package manifest. Do not attempt to stage a version twice:
  npm versions are immutable and already-staged versions return `E409`.
- The workflow uses `actions/setup-node` **without** `registry-url`
  in the OIDC job. Supplying `registry-url` can inject a placeholder
  `NODE_AUTH_TOKEN`, causing legacy-token `E401` failures. The job
  requires GitHub OIDC request variables and rejects conventional tokens.
- A Sigstore transparency entry by itself does **not** prove that
  registry staging succeeded. Confirm the workflow's successful stage
  ID before requesting approval.
- No GITHUB_TOKEN/NPM_TOKEN can approve staged npm versions; a human
  approval with npm 2FA is always required.
- Only the protected staging job has `id-token: write`; ordinary CI
  and verification remain read-only.

## References

- [npm staged publishing](https://docs.npmjs.com/staged-publishing/)
- [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/)
- [GitHub protected environments](https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments)
