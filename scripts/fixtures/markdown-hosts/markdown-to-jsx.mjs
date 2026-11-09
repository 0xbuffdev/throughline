import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import Markdown, { RuleType } from "markdown-to-jsx/react";
import { ThroughlineEmbed } from "@0xbuff/throughline/react";

/**
 * markdown-to-jsx does not run Remark. Adapt its own codeBlock rule using
 * the shared, bounded Throughline source bridge. The domain lives in the
 * first body line because non-Unified parsers may discard fence metadata.
 */
const options = {
  renderRule(next, node, _renderChildren, state) {
    if (node.type !== RuleType.codeBlock) return next();
    if (node.lang !== "thl") return next();
    const source = String(node.text ?? "");
    if (!/^thl (?:flow|bindings|binary|matrix|callstack)\r?\n/.test(source)) {
      throw new Error(
        "A markdown-to-jsx thl block must begin with 'thl <domain>' on its first body line.",
      );
    }
    return createElement(ThroughlineEmbed, { key: state.key, source });
  },
};
const markdown = [
  "# Markdown-to-JSX trace integration", "",
  "~~~thl", "thl binary", "a = 1011", "b = 0110", "~~~",
  "", "~~~js", "const unaffected = true;", "~~~",
].join("\n");
const html = renderToString(createElement(Markdown, { options, children: markdown }));
assert.match(html, /Visualization player/);
assert.match(html, /Markdown-to-JSX trace integration/);
assert.match(html, /const unaffected = true;/);
assert.throws(
  () => renderToString(createElement(Markdown, {
    options, children: "~~~thl\nthl flow\ninvalid\n~~~",
  })),
  /invalid|Expected|Unknown/i,
);
