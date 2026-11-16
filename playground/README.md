# Throughline Playground

A static, browser-only authoring workspace for schema-2 VisualArtifact JSON. This
is the public-facing experience, not a fixed development preview or a separately
published package. It imports the current repository source, so deployment must
be aligned with a reviewed and tested commit.

## User workflow

- Load one of four reference artifacts, or select **New trace**.
- Edit strict schema-2 JSON and see semantic compiler diagnostics after a brief
  pause. The path in a diagnostic refers to the JSON artifact.
- On a valid artifact, use Graph, Sequence, State table and Explain/Inspect in
  the native player; change its width, presentation theme or playback settings.
- **Format** canonicalizes an already valid artifact into indented JSON.
- **Copy thl** copies a fenced Markdown snippet; **Export** downloads a validated
  JSON artifact. Invalid or unreviewed prose is not exported as runnable data.
- Pasting a single complete `thl` Markdown fence unwraps it into editable JSON.
- Edits remain in the current browser tab; there is deliberately no account,
  save service, telemetry, network-backed compiler or automatic AI generation.

The editor interprets a body beginning with `{` as strict schema-2 JSON, just
as the source library does. Any other nonempty body is descriptive intent:
it needs independently reviewed materialization and a trusted host's approved
sidecar. The public playground deliberately does not fabricate that step.

## Player design review (TL-P01)

Open [the Player design review](http://localhost:5173/?player-lab=1) from the
Playground header, or add `?player-lab=1` to the same deployed Playground URL.

This **review surface is not the new production player**. Its **Live player** mode
uses the real schema-2 compiler and unchanged native React player, so it exposes
the current rendering at 260, 320, 375, 768 and 1280 CSS-pixel host widths.
Select the four verified references, initial graph/sequence/state-table view,
light/dark/system theme, long-label/no-title cases, or an intentionally
non-rendered invalid case. Use native transport to inspect initial, middle and
final steps, select a node and open Inspect. The player may still look cramped:
that is precisely what TL-P02–TL-P04 are intended to fix.

**Layout study** is an explicitly static anatomy proposal, not a functioning
renderer, fabricated artifact, working transport or screenshot of shipped UI.
It previews the intended hierarchy, token treatment and primary control sizes.
The five regions and design decisions are documented in
[the source design system](../docs/player-design-system.md).

For reproducible *real browser* review images, first build the Playground, then:

```sh
pnpm preview:build
pnpm audit:player-design
```

Images and the environment manifest are written under
`.release-evidence/player-design/` (ignored by Git, available as a CI artifact).
These are **unapproved baseline captures** until manually reviewed. Do not
replace an actual screenshot with the static layout study or claim that
screenshot checks prove accessibility. For the complete fixture/interaction
review, follow [the visual review checklist](../docs/player-design-system.md#visual-review-and-reproducible-fixtures).

## Local development

From the repository root, with Node.js >=24 and the pinned pnpm:

```sh
pnpm install --frozen-lockfile
pnpm preview:typecheck
pnpm dev
```

Visit http://localhost:5173. Before release, run:

```sh
pnpm test:run
pnpm preview:build
pnpm test:browser:run
```

The static output lives in **playground/dist**. No backend routes, API keys or
service bindings are necessary. The package's own `pnpm build` and tarball do
not include the playground.

## Cloudflare Pages deployment (maintainer setup)

Suggested hostname: **playground.0xbuff.com**, after the maintainer has
confirmed DNS ownership. This proposal does not create DNS or deploy the app.

Connect this public repository to a Cloudflare Pages project and configure:

| Setting | Value |
| --- | --- |
| Source branch | `main` after the PR is reviewed and merged |
| Root directory | Repository root |
| Build command | `corepack enable && pnpm install --frozen-lockfile && pnpm preview:build` |
| Output directory | `playground/dist` |
| Build environment | Node.js 24 (set `NODE_VERSION=24` if needed) |
| Environment variables / secrets | None required by the playground |

The pinned `packageManager` is `pnpm@11.2.2`. Ensure the Pages build
environment supports Corepack/pnpm for that version. Verify the Pages preview
deployment, keyboard navigation, paste/edit/validation, theme, narrow viewport,
console errors and actual artifact export **before** attaching a public custom
domain. In Cloudflare Pages, use the project's **Custom domains** control to
attach the chosen subdomain and follow the DNS guidance for the zone; confirm
the certificate and HTTPS before announcing the URL.

The `public/_headers` file is copied into the static build and adds basic
security and privacy headers when served by Cloudflare Pages. Cloudflare
deployment credentials and DNS records must never be committed to this repo.

## Release boundaries

The playground follows the checked-out schema-2 **source**, not the currently
published npm release. A successful preview deployment is not evidence of npm
v0.2.0 publication, TL-U18 real screen-reader acceptance or completion of
the planned higher-level ThroughlineDocument/VisualPlan capabilities.
