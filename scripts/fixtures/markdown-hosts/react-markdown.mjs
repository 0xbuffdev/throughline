import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import Markdown from "react-markdown";
import { remarkThroughline } from "@0xbuff/throughline/remark";
import { resolveThlBody, serializeArtifact } from "@0xbuff/throughline";
import { ThroughlineEmbed } from "@0xbuff/throughline/react";

// react-markdown does not render MDX. Validate before annotating; the host
// explicitly supplies the already validated and compiled v2 artifact data.
function attachValidatedArtifact() {
  return (tree) => {
    function visit(node) {
      if (node.type === "code" && node.lang === "thl") {
        node.data = {
          ...node.data,
          hProperties: {
            ...node.data?.hProperties,
            "data-thl-artifact": serializeArtifact(resolveThlBody(node.value)),
          },
        };
      }
      for (const child of node.children ?? []) visit(child);
    }
    visit(tree);
  };
}
const options = {
  remarkPlugins: [remarkThroughline, attachValidatedArtifact],
  components: {
    pre({ node, ...props }) {
      const code = node?.children?.find(child => child.type === "element" && child.tagName === "code");
      const artifactJson = code?.properties?.["data-thl-artifact"];
      return typeof artifactJson === "string"
        ? createElement(ThroughlineEmbed, { artifactJson })
        : createElement("pre", props);
    },
  },
};
const artifact = {"schemaVersion":2,"id":"markdown","origins":[{"id":"author","kind":"authored"}],"entities":[{"id":"counter","label":"Counter"}],"relations":[],"initialState":{"counter":{"status":"known","value":0}},"steps":[{"id":"next","label":"Increment","events":[{"id":"w","originId":"author","type":"write","entityId":"counter","path":[],"value":{"status":"known","value":1}}]}]};
const markdown = ["# React Markdown trace integration", "",
  "~~~thl", artifact, "~~~",
  "", "~~~js", "const unmodified = 1;", "~~~",
].join("\n");
const html = renderToString(createElement(Markdown, { ...options, children: markdown }));
assert.match(html, /Visualization player/);
assert.match(html, /React Markdown trace integration/);
assert.match(html, /const unmodified = 1;/);
assert.doesNotMatch(html, /data-thl-artifact=/);
const untouchedMarkdown = ["# Unchanged Markdown", "", "Plain Markdown without any Throughline fences.", "",
  "~~~js", "const stillPlain = true;", "~~~",
].join("\n");
const untouchedHtml = renderToString(createElement(Markdown, { ...options, children: untouchedMarkdown }));
assert.match(untouchedHtml, /stillPlain = true/);
assert.doesNotMatch(untouchedHtml, /Visualization player/);
assert.throws(() => renderToString(createElement(Markdown, {
  ...options, children: "~~~thl\n{bad\n~~~",
})), /invalid|THL_ARTIFACT/i);
