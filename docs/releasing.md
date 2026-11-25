# Releasing Throughline

The package is distributed as [@0xbuff/throughline](https://www.npmjs.com/package/@0xbuff/throughline).
Each version is published from an immutable, GitHub-verified signed
`vX.Y.Z` tag using manual GitHub Actions OIDC staged publishing.
**The GitHub workflow only stages a release; npm 2FA approval publishes it.**

## Schema-2 release prerequisite

The current release gate authorizes only version 0.2.0 and tag v0.2.0; later versions require a separately reviewed release policy. Version 0.2.0 must ship the stable Mermaid Graph and Sequence renderer, with native State table and unchanged semantic engine. Complete TL-U26 feasibility and reviewed go/no-go, TL-U27 Graph, TL-U28 Sequence and TL-U29 production cutover before final TL-U18 acceptance. See the [feasibility report](mermaid-feasibility.md) for remaining parity, dependency, safety and performance gates. The current development-only preview is not production acceptance. If a mandatory renderer requirement fails, retain the working native implementation during development and block publication until corrected or a reviewed maintainer decision changes the requirement.

Reuse prior verification tooling, not prior attestation: run the complete release-quality suite and actual screen-reader checks on the exact integrated source and independently packed candidate. TL-U19 signing, staging and human 2FA remain separate approvals; TL-U20 real documentation-app adoption follows verified registry publication.

## Verification

Use Node.js 24+, pnpm 11.2.2 and the committed lockfile. Run the full
release suite on the exact reviewed revision:

~~~sh
pnpm install --frozen-lockfile
pnpm audit:source
pnpm typecheck
pnpm test:cli
pnpm preview:typecheck
pnpm preview:build
pnpm test:run
# CI additionally validates SHA-bound TL-U18 JSON performance/security evidence.
pnpm test:release-performance
pnpm test:release-security
pnpm exec playwright install chromium
pnpm test:browser:run
pnpm build
pnpm audit:licenses
pnpm audit:pack
pnpm audit:browser
pnpm audit:frameworks
pnpm audit:markdown-hosts
~~~

Inspect the [release-quality evidence and manual accessibility checklist](release-quality.md) before authorizing a package release. Exact-head CI checks `v2-performance.json` and `v2-security.json`, and attaches them as GitHub Actions artifacts alongside Chromium, Firefox and WebKit browser evidence. The performance numbers are measured baselines, **not** unreviewed latency SLAs. **Real screen-reader acceptance on a source- and tarball-SHA-bound candidate must be performed before TL-U18 can be closed.** Follow the [actual AT test-record instructions](qa/tl-u18-screen-reader-record.md); the current record is NOT PERFORMED. Real native-browser zoom and other device checks must be reported as performed or outstanding for the TL-U19 release review, never silently passed.

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

1. Confirm stable production Mermaid cutover (TL-U29), then verify rights to distribute the source, applicable third-party notices,
   security reporting, release acceptance, compatibility and the final
   changelog. Review the public history for any sensitive references.
   Historical exposure cannot be undone by deleting current-tree files.
2. Update the version in `package.json` and document the changes in
   `CHANGELOG.md`. Maintain the six public package exports and the separate `thl` binary;
   schema-2 `VisualArtifact.schemaVersion` is independent of npm SemVer.
3. Run the source, TypeScript, preview, Chromium/Firefox/WebKit browser,
   build, license and packed consumer checks listed above.
   Record the exact integrated candidate SHA, CI runs, Mermaid parity evidence, quality evidence artifacts and actual screen-reader/rights review.
   Merge the release PR after review and ensure main CI is green. Dispatch the release workflow from main in `prepare` mode with the prospective tag and `PREPARE-v0.2.0`. Review the immutable candidate archive and its successful workflow run/attempt, install those exact bytes for the human AT and native zoom checks, and complete the maintainer attestation as described in [release-quality.md](release-quality.md#two-dispatch-release-candidate-gate-f26f27).
4. From a clean checkout with a signing key registered with GitHub, create
   and push an immutable signed tag **only after** the release commit is
   merged. For the proposed schema-2 version `0.2.0` (only if approved):

   ~~~sh
   git switch main
   git pull --ff-only
   git tag -s v0.2.0 -m "Throughline v0.2.0"
   git tag -v v0.2.0
   git push origin v0.2.0
   ~~~

   GitHub must show the tag as **Verified**. Protect `v*` tag updates and
   deletions. Do not move or reuse existing release tags.
5. In [GitHub Actions](https://github.com/0xbuffdev/throughline/actions),
   run **Throughline npm release (staged with provenance)** from `main`.
   Choose `stage`, enter the signed tag (e.g. `v0.2.0`), confirmation
   `STAGE-v0.2.0`, successful prepare run ID and attempt, and the exact-candidate review JSON. The read-only authorization job checks the signed tag, current dispatch source, successful prepare attempt, production audit records, archive SHA-256 and explicit human evidence attestation. It does not rebuild the archive.
6. Independently inspect the actual linked QA and rights records, review the exact GitHub candidate archive and approve the protected
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
   npm view @0xbuff/throughline@0.2.0 version
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
