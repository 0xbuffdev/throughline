import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { bundleMDX } from "mdx-bundler";
import { getMDXComponent } from "mdx-bundler/client";
import { remarkThroughline } from "@0xbuff/throughline/remark";
import { ThroughlineEmbed } from "@0xbuff/throughline/react";

// Preserve all host plugins and add the existing opt-in MDX transformation.
function withThroughline(options) {
  options.remarkPlugins = [
    ...(options.remarkPlugins ?? []),
    [remarkThroughline, { mode: "mdx" }],
  ];
  return options;
}
const markdown = [
  "# Bundler trace integration", "",
  "~~~thl flow", 'node counter "Counter" = 0',
  'step "Increment"', "  set counter = 1", "~~~",
  "", "~~~js", "let untouched = true;", "~~~",
].join("\n");

// mdx-bundler emits executable JS: only compile and run trusted MDX source.
const { code } = await bundleMDX({
  source: markdown,
  mdxOptions: withThroughline,
});
const Content = getMDXComponent(code);
const html = renderToString(createElement(Content, { components: { ThroughlineEmbed } }));
assert.match(html, /Visualization player/);
assert.match(html, /Bundler trace integration/);
assert.match(html, /untouched/);
await assert.rejects(
  () => bundleMDX({
    source: "~~~thl flow\ninvalid\n~~~",
    mdxOptions: withThroughline,
  }),
  /invalid|Expected|Unknown/i,
);
