import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import Markdown from "react-markdown";
import { remarkThroughline } from "@0xbuff/throughline/remark";
import { ThroughlineEmbed } from "@0xbuff/throughline/react";

/**
 * react-markdown runs a Remark pipeline, but renders HTML rather than MDX.
 * Validate first with the official plugin; only then annotate the ordinary
 * code node for a host-owned React component replacement. No JSX injection.
 */
function attachValidatedSource() {
  return (tree) => {
    function visit(node) {
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
    }
    visit(tree);
  };
}

const options = {
  remarkPlugins: [remarkThroughline, attachValidatedSource],
  components: {
    pre({ node, ...props }) {
      const source = node?.properties?.["data-thl-source"];
      return typeof source === "string"
        ? createElement(ThroughlineEmbed, { source })
        : createElement("pre", props);
    },
  },
};
const markdown = [
  "# React Markdown trace integration", "",
  "~~~thl binary", "a = 1011", "b = 0110", "~~~",
  "", "~~~js", "const unmodified = 1;", "~~~",
].join("\n");

const html = renderToString(createElement(Markdown, { ...options, children: markdown }));
assert.match(html, /Visualization player/);
assert.match(html, /React Markdown trace integration/);
assert.match(html, /const unmodified = 1;/);
assert.doesNotMatch(html, /data-thl-source=/);
assert.throws(
  () => renderToString(createElement(Markdown, {
    ...options, children: "~~~thl flow\ninvalid\n~~~",
  })),
  /invalid|Expected|Unknown/i,
);
