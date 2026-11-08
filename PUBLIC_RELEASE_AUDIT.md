# Public-source and rights audit

Status: **Apache-2.0 selected — public release still blocked**  
Scope: standalone Throughline source tree, CI configuration, public package
manifest, and first-release dependencies. First reviewed November 8, 2026.

This record summarizes technical findings, not a legal opinion or proof of
copyright ownership. The maintainer selected Apache-2.0 for the independent
Throughline project; this does not authorize npm publication or public
repository visibility before the remaining rights and release gates pass.

## Verified technical evidence

- The private standalone extraction retained the original compiler, renderer,
  domain, CSS, tests, and documentation without copying unrelated repository
  history. The extraction review compared 64 source file Git blob hashes.
- GitHub Actions has built the standalone project under Node 24 and passed
  unit tests, browser tests, TypeScript checks, and tarball-installed consumers.
- The package exposes only the root compiler, optional React player, examples,
  and explicit stylesheet. The compiler does not require accounts or React.
- A source review found no apparent credential material, host-only package
  imports, telemetry/network calls, or copied third-party copyright headers
  in the extracted implementation and test files. This is a heuristic review,
  **not** a guarantee that all sensitive or third-party material is absent.
- The extraction's original maintainer instructions linked a private planning
  resource; the accompanying change removes that link before public visibility.
- Third-party package metadata identifies the shipped runtime dependency
  `cn@0.4.0` and the supported optional React/React DOM 19 peers as
  **MIT-licensed**. The repository audit checks installed package metadata,
  not a complete legal review of every transitive dependency. Bundled output
  and notices require one more release-candidate review.

## Publication blockers

1. **Authorship and rights:** confirm the maintainer owns or has sufficient
   distribution rights to every retained implementation, example, screenshot,
   test fixture, and documentation passage. Inspect any external inspirations,
   snippets, or contributed work beyond automated pattern checks.
2. **Copyright ownership and attribution:** Apache-2.0 is selected, and the
   standard LICENSE file and npm SPDX metadata have been added. Before the
   public release, confirm the rights holder(s), accurate copyright year(s),
   any file-level copyright attributions, and third-party NOTICE obligations.
   Do not invent a legal entity or author attribution. The package intentionally
   remains `private: true` at version `0.0.0`.
3. **Dependency notices:** verify the packed artifacts do not embed any
   third-party code without its required license and notices; review all
   transitive runtime dependencies and their actual distributed license files.
4. **Security:** perform a release-candidate secret scan and manual inspection
   across every tracked and packed file. The new static source guard is
   intentionally a preliminary, narrow detector.
5. **External API validation:** finish an independently installed Vite/React
   browser and hydration consumer, including an export/deep-import probe and
   reduced-motion coverage; in-repository browser tests and SSR alone do not
   satisfy the complete external acceptance matrix.
6. **Source authority:** retire the old private incubation copy by moving
   private integrations to a version-pinned published package under a separate
   reviewed change. Do not leave two permanent authoritative implementations.
7. **Release controls:** verify ownership of the npm scope, public repository
   readiness, provenance-capable trusted publishing, version `0.0.1`,
   changelog, immutable tag, manual authorization and final package checksum.

## Outcome

**Apache-2.0 is selected; public release is not yet authorized.** A passing
source audit only demonstrates the checks it performed. The license selection
cannot establish ownership rights, clear unknown third-party code, or authorize
an npm publication or repository visibility change.

The source repository may remain private while these gates are resolved.
