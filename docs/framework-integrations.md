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

Astro 7 defaults to Sätteri, which does not run Remark plugins. Install `@astrojs/markdown-remark` and configure `@astrojs/mdx` with `processor: unified({ remarkPlugins: [[remarkThroughline, { mode: "mdx" }]] })`. Register `@astrojs/react`. Import an Astro wrapper named `ThroughlineEmbed` into the MDX page. The wrapper renders the React `ThroughlineEmbed` with `client:load` and imports Throughline CSS. Without the hydration directive, the player can render static markup but cannot respond to browser input.

## react-markdown (plain Markdown with a React player)

`react-markdown` supports Remark plugins, but does **not** compile MDX component nodes. Configure the existing `remarkThroughline` in its default validation mode. A small host-owned Remark adapter can attach the already-validated source to its native `pre` element; the React `components.pre` override then renders `ThroughlineEmbed`. Unlike MDX, do **not** use `mode: "mdx"` in this host.

~~~jsx
import Markdown from "react-markdown";
import { remarkThroughline } from "@0xbuff/throughline/remark";
import { ThroughlineEmbed } from "@0xbuff/throughline/react";
import "@0xbuff/throughline/styles/throughline.css";

function attachSource() {
  return (tree) => {
    const visit = (node) => {
      if (node.type === "code" && node.lang === "thl") {
        node.data = {
          ...node.data,
          hProperties: {
            ...node.data?.hProperties,
            "data-thl-source": ["thl " + node.meta, node.value].join("\n"),
          },
        };
      }
      for (const child of node.children ?? []) visit(child);
    };
    visit(tree);
  };
}

export function TraceMarkdown({ source }) {
  return (
    <Markdown
      remarkPlugins={[remarkThroughline, attachSource]}
      components={{
        pre({ node, ...props }) {
          const code = node?.children?.find(
            (child) => child.type === "element" && child.tagName === "code",
          );
          const traceSource = code?.properties?.["data-thl-source"];
          return typeof traceSource === "string"
            ? <ThroughlineEmbed source={traceSource} />
            : <pre {...props} />;
        },
      }}
    >
      {source}
    </Markdown>
  );
}
~~~

Compile content with the same validation plugin before publishing if the Markdown is hosted externally. Never use `rehype-raw` or `dangerouslySetInnerHTML` merely to mount a player. The fixture verifies rendered frames, invalid fences, and unchanged unrelated code.

## mdx-bundler

`mdx-bundler` uses Unified/MDX, so it accepts `remarkThroughline({ mode: "mdx" })` directly. Preserve existing plugins when modifying the processor:

~~~jsx
import { bundleMDX } from "mdx-bundler";
import { getMDXComponent } from "mdx-bundler/client";
import { remarkThroughline } from "@0xbuff/throughline/remark";
import { ThroughlineEmbed } from "@0xbuff/throughline/react";
import "@0xbuff/throughline/styles/throughline.css";

const { code } = await bundleMDX({
  source: markdown,
  mdxOptions(options) {
    options.remarkPlugins = [
      ...(options.remarkPlugins ?? []),
      [remarkThroughline, { mode: "mdx" }],
    ];
    return options;
  },
});
const Content = getMDXComponent(code);
// Render in a React component:
// <Content components={{ ThroughlineEmbed }} />
~~~

Bundle at build time and execute the compiled MDX **only for trusted content**: MDX is executable JavaScript, and this plugin's safe literal trace attributes do not make arbitrary MDX safe. The fixture verifies registered-component rendering and controlled build failure for invalid traces.

## markdown-to-jsx (non-Remark parser)

`markdown-to-jsx` has its own parser and does not support `remarkPlugins`; attaching the existing Remark plugin to it would be ineffective. Use its `RuleType.codeBlock` render hook and the existing `ThroughlineEmbed` source bridge instead. To preserve the required domain when the host only retains a single info-string language, put the complete Throughline header on the first body line:

~~~~md
~~~thl
thl flow
node counter "Counter" = 0
step "Increase"
  set counter = 1
~~~
~~~~

~~~jsx
import Markdown, { RuleType } from "markdown-to-jsx/react";
import { ThroughlineEmbed } from "@0xbuff/throughline/react";
import "@0xbuff/throughline/styles/throughline.css";

export function TraceMarkdown({ source }) {
  return (
    <Markdown
      options={{
        renderRule(next, node, _children, state) {
          if (node.type !== RuleType.codeBlock || node.lang !== "thl") {
            return next();
          }
          const traceSource = String(node.text ?? "");
          if (!/^thl (flow|bindings|binary|matrix|callstack)\r?\n/.test(traceSource)) {
            throw new Error("Expected 'thl <domain>' on the first line of the block.");
          }
          return <ThroughlineEmbed key={state.key} source={traceSource} />;
        },
      }}
    >
      {source}
    </Markdown>
  );
}
~~~

This adapter does not pretend to execute Remark, and it does not automatically transform a standard `~~~thl flow` info string. The fixture verifies that the renderer fails on invalid Throughline sources and preserves unrelated fenced code. When source comes from a publishing system, validate it separately before publication.

## Release and test boundary

`pnpm audit:frameworks` packs the current source into a tarball and installs it into **independent** temporary Fumadocs, Next.js and Astro consumer projects, using pinned host dependencies. The integration checks validate Fumadocs config and MDX compilation, build Next.js's App Router static output, and build Astro's hydrated React island. They do not deploy either host, test private integrations, or establish manual assistive-technology approval. `pnpm audit:markdown-hosts` packs the same source and checks real SSR integration with `react-markdown`, `mdx-bundler`, and `markdown-to-jsx`, including invalid input and unrelated code fences. The existing `audit:pack` covers Node-only, Remark/MDX, source escaping, SSR and root/React import isolation. The existing `audit:browser` covers Vite React hydration; it does not imply Next.js or Astro browser-event testing.

The production documentation application must continue using the current published package until a reviewed release candidate is approved and published. Release approval, package versioning, signing, npm distribution, site update and deployment are separate maintainer actions.
