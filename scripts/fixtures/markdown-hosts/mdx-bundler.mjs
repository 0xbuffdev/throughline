import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { bundleMDX } from "mdx-bundler";
import { getMDXComponent } from "mdx-bundler/client/index.js";
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
  "~~~thl", JSON.stringify({"schemaVersion":2,"id":"host","origins":[{"id":"author","kind":"authored"}],"entities":[{"id":"counter","label":"Counter"}],"relations":[],"initialState":{"counter":{"status":"known","value":0}},"steps":[{"id":"advance","label":"Advance","events":[{"id":"w","originId":"author","type":"write","entityId":"counter","path":[],"value":{"status":"known","value":1}}]}]}), "~~~",
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
const untouchedMarkdown = [
  "# Unchanged MDX content", "", "Plain MDX without Throughline fences.", "",
  "~~~js", "const stillPlain = true;", "~~~",
].join("\n");
const { code: plainCode } = await bundleMDX({ source: untouchedMarkdown, mdxOptions: withThroughline });
const PlainContent = getMDXComponent(plainCode);
const untouchedHtml = renderToString(createElement(PlainContent, { components: { ThroughlineEmbed } }));
assert.match(untouchedHtml, /stillPlain = true/);
assert.doesNotMatch(untouchedHtml, /Visualization player/);

await assert.rejects(
  () => bundleMDX({
    source: "~~~thl\n{bad\n~~~",
    mdxOptions: withThroughline,
  }),
  /invalid|Expected|Unknown/i,
);
