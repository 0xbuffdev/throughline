# Contributing to Throughline

Throughline is maintained by one project maintainer. Bug reports,
documentation corrections, test improvements and narrowly scoped code
contributions are welcome. Opening a PR does not guarantee acceptance.

## Before you start

- Check the [README](README.md), [authoring docs](docs/grammar.md),
  [domain catalog](docs/catalog.md) and existing issues.
- For an API, grammar, trace-schema, accessibility or dependency change,
  discuss its compatibility impact in an issue before implementing.
- Keep Throughline independent of private applications, curricula,
  accounts, external services, unpublished dependencies and telemetry.
- Do not include credentials, private documents, proprietary code or
  sensitive vulnerability details in a public issue or PR.

## Development

Prerequisites: Node.js 24+, pnpm 11.2.2 and a Chromium-capable system.

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

This repository is a standalone package. The root compiler must stay
React-free and deterministic; optional React peer dependencies belong
only in the player. See [architecture](docs/architecture.md) for the
compiler-to-player boundary.

## Pull requests

1. Open a focused branch and keep unrelated changes separate.
2. Add regression tests for behavior changes; cover browser behavior,
   keyboard access, reduced motion or hydration when relevant.
3. Update docs and examples when authoring syntax, exports or observable
   behavior changes. Do not silently change schema version 1.
4. Run applicable tests and record exactly what passed. Avoid skipped
   or focused tests.
5. Open the PR with a concise purpose, implementation notes, potential
   compatibility risks, test results and any remaining work.

The maintainer performs final review, any required signing and merge.
Do not publish npm packages, create release tags or change repository
visibility as part of a contribution without explicit authorization.

## Community and security

Follow [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md). For security-sensitive
findings, follow [SECURITY.md](SECURITY.md) instead of opening a public
issue with exploitation details.

By submitting a contribution, you agree it may be distributed under
the repository's [Apache-2.0 license](LICENSE); do not submit code or
content that you lack rights to contribute.

## Support

For usage questions, consult the [README](README.md),
[grammar reference](docs/grammar.md),
[domain catalog](docs/catalog.md), and
[architecture notes](docs/architecture.md).

For a reproducible bug, use the
[bug report template](https://github.com/0xbuffdev/throughline/issues/new/choose)
and include the version,
minimal authored `thl` block, expected/actual behavior and relevant
runtime (Node, browser, React). Avoid disclosing secrets or sensitive
content.

For an API or feature idea, use the feature request template and
explain the underlying problem and compatibility impact. The project
has a sole maintainer; support and review are provided as available,
without a guaranteed response time.

**Security vulnerabilities:** use [SECURITY.md](SECURITY.md) rather than
publishing exploitation details in an issue.

## Maintainer release procedure

The package is distributed as [@0xbuff/throughline](https://www.npmjs.com/package/@0xbuff/throughline).
Each version is published from an immutable, GitHub-verified signed
`vX.Y.Z` tag using manual GitHub Actions OIDC staged publishing.
**The GitHub workflow only stages a release; npm 2FA approval publishes it.**

### Release checklist

1. Close the [v0.1.0 readiness gates](docs/release-readiness-v0.1.0.md) before publication. Confirm source ownership, third-party licenses, security reporting,
   public Git-history safety and the final changelog. The repository's
   earliest Git history contains a historical private planning reference.
   This has already been exposed by public visibility; deleting files from
   the latest tree does not erase old commits, forks or caches.
2. Update the version in `package.json` and document the changes in
   `CHANGELOG.md`. Maintain the five public package exports and keep
   `Program.version` / `Trace.version` independent of npm SemVer.
3. Run the source, TypeScript, preview, Chromium/Firefox/WebKit browser,
   build, license and packed consumer checks described in `AGENTS.md`.
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

### Operational safeguards

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

### Release references

- [npm staged publishing](https://docs.npmjs.com/staged-publishing/)
- [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/)
- [GitHub protected environments](https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments)
