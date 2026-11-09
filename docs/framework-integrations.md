# Framework integration checks

These examples target the **unreleased** Remark/MDX integration on the Throughline source branch. They are not installation instructions for the published v0.0.2 package. Do not enable these imports in deployed documentation until an approved package release includes them.

The package has separate, opt-in exports: the compiler at `@0xbuff/throughline`, the Remark validator/transform at `@0xbuff/throughline/remark`, the React 19 player/source bridge at `@0xbuff/throughline/react`, and the stylesheet at `@0xbuff/throughline/styles/throughline.css`. Core and Remark do not import React.

## Plain Markdown and Node

Use a Unified pipeline to validate fences while preserving code nodes:

~~~js
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkStringify from "remark-stringify";
import { remarkThroughline } from "@0xbuff/throughline/remark";

const processor = unified().use(remarkParse).use(remarkThroughline).use(remarkStringify);
const markdown = "~~~thl binary\na = 1011\nb = 0110\n~~~";
const result = await processor.process({ path: "lesson.md", value: markdown });
console.log(String(result)); // Source remains ordinary Markdown, not a player.
~~~

The default `validate` mode preserves other Markdown and MDX nodes. It fails invalid trace fences with the host file path and a verified source position when possible. It does not execute author content or mount a UI. Hosts containing many fences should enforce a document-wide size/work budget.

## Fumadocs Unified / React Router

Add the plugin only to the Unified compiler's existing options:

~~~ts
import { remarkMdxMermaid } from "fumadocs-core/mdx-plugins";
import { defineConfig } from "fumadocs-mdx/config";
import rehypeKatex from "rehype-katex";
import remarkMath from "remark-math";
import { remarkThroughline } from "@0xbuff/throughline/remark";

export default defineConfig({
  mdxOptions: {
    remarkPlugins: (existing) => [
      [remarkThroughline, { mode: "mdx" }],
      remarkMath,
      remarkMdxMermaid,
      ...existing,
    ],
    rehypePlugins: (existing) => [rehypeKatex, ...existing],
  },
});
~~~

Register `ThroughlineEmbed` from `@0xbuff/throughline/react` in the site's MDX component map, retaining default/custom components. Import the CSS once in the host. Fumadocs **Sätteri** is a different compiler with its own plugin system: Remark plugins do **not** run there. No Sätteri adapter is provided.

## Next.js App Router

In `next.config.mjs`, configure `@next/mdx` with `remarkPlugins: [[remarkThroughline, { mode: "mdx" }]]` and include `mdx` in `pageExtensions`. Export `useMDXComponents` from `mdx-components.jsx` mapping `ThroughlineEmbed` to a component with a `"use client"` boundary. Import the Throughline CSS in the app layout. The independent fixture uses `next build --webpack` because it passes an actual JavaScript Remark plugin function.

## Astro

Configure `@astrojs/mdx` with the same Remark tuple and register `@astrojs/react`. Import an Astro wrapper named `ThroughlineEmbed` into the MDX page. The wrapper renders the React `ThroughlineEmbed` with `client:load` and imports Throughline CSS. Without the hydration directive, the player can render static markup but cannot respond to browser input.

## Release and test boundary

`pnpm audit:frameworks` packs the current source into a tarball and installs it into **independent** temporary Fumadocs, Next.js and Astro consumer projects, using pinned host dependencies. The integration checks validate Fumadocs config and MDX compilation, build Next.js's App Router static output, and build Astro's hydrated React island. They do not deploy either host, test private integrations, or establish manual assistive-technology approval. The existing `audit:pack` covers Node-only, Remark/MDX, source escaping, SSR and root/React import isolation. The existing `audit:browser` covers Vite React hydration; it does not imply Next.js or Astro browser-event testing.

The production documentation application must continue using the current published package until a reviewed release candidate is approved and published. Release approval, package versioning, signing, npm distribution, site update and deployment are separate maintainer actions.
