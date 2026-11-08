# Throughline repository guidance

This is the standalone private source repository for `@0xbuff/throughline`,
an independently usable authored state-trace compiler and optional React player.

## Authority
- Product release contract: https://github.com/0xbuffdev/context/blob/main/repos/throughline/specs/0001-public-engine.md
- This source repository becomes implementation authority after the extraction
  PR is reviewed and merged; the private platform copy is an incubating copy.
- Keep the library independent of 0xNAND, OEE curriculum, assessments,
  authentication, credentials, and private workspace packages.

## Development
- Node 24 and pnpm 11.2.2; use the repository's declared dependencies.
- Maintain an offline, deterministic, React-free root compiler export.
- React and React DOM are optional peer dependencies for `./react`.
- Keep four public import paths stable; CSS is explicit and namespaced.
- Do not silently change the v1 trace schema or the five authored domains.
- Tests must accompany changes. Verify Node and browser tests, TypeScript,
  tsdown build, and packed-tarball consumer checks.
- Preserve bounded errors, source locations, accessible keyboard controls,
  reduced motion, and optional sonification.

## Review and release
- Work on distinct branches and open PRs against `main`.
- I am the sole maintainer and will perform final review, signing and merge.
- Do not publish, change repository visibility, or remove `private: true`
  until licensing, source audit, independent tests, and provenance CI pass
  and I explicitly authorize publication.
- Do not copy private monorepo history, application code or internal records.
