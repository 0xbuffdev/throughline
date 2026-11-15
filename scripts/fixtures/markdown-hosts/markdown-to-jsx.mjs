import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import Markdown, { RuleType } from "markdown-to-jsx/react";
import { resolveThlBody, serializeArtifact } from "@0xbuff/throughline";
import { ThroughlineEmbed } from "@0xbuff/throughline/react";

// This host does not run Remark. It validates the exact code-block body
// through the same pure universal thl contract, without domain routing.
const options = {
  renderRule(next, node, _renderChildren, state) {
    if (node.type !== RuleType.codeBlock || node.lang !== "thl") return next();
    const artifactJson = serializeArtifact(resolveThlBody(String(node.text ?? "")));
    return createElement(ThroughlineEmbed, { key: state.key, artifactJson });
  },
};
const artifact = JSON.stringify({"schemaVersion":2,"id":"markdown","origins":[{"id":"author","kind":"authored"}],"entities":[{"id":"counter","label":"Counter"}],"relations":[],"initialState":{"counter":{"status":"known","value":0}},"steps":[{"id":"next","label":"Increment","events":[{"id":"w","originId":"author","type":"write","entityId":"counter","path":[],"value":{"status":"known","value":1}}]}]});
const markdown = ["# Markdown-to-JSX trace integration", "",
  "~~~thl", artifact, "~~~",
  "", "~~~js", "const unaffected = true;", "~~~",
].join("\n");
const html = renderToString(createElement(Markdown, { options, children: markdown }));
assert.match(html, /Visualization player/);
assert.match(html, /Markdown-to-JSX trace integration/);
assert.match(html, /const unaffected = true;/);
const untouchedMarkdown = ["# Unchanged Markdown", "", "Plain Markdown without Throughline fences.", "",
  "~~~js", "const stillPlain = true;", "~~~",
].join("\n");
const untouchedHtml = renderToString(createElement(Markdown, { options, children: untouchedMarkdown }));
assert.match(untouchedHtml, /stillPlain = true/);
assert.doesNotMatch(untouchedHtml, /Visualization player/);
assert.throws(() => renderToString(createElement(Markdown, {
  options, children: "~~~thl\n{bad\n~~~",
})), /invalid|THL_ARTIFACT/i);
