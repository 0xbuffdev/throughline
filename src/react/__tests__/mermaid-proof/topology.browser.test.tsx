import { expect, it } from "vitest";
import { compileArtifact } from "../../../v2/compiler.js";
import { inspectTrace } from "../../../v2/inspector.js";
import { projectView } from "../../../v2/views.js";
import type { ViewDescriptor, ViewItem } from "../../../v2/model.js";
import { distributedGraph } from "../../../__tests__/v2-graph-fixture.js";
import { graphProof } from "../../mermaid/adapter.js";
import { renderProof } from "../../mermaid/render.js";

it("compares a union layout scaffold with current presence without displaying future entities", async () => {
	const trace = compileArtifact(distributedGraph()), inspector = inspectTrace(trace);
	const views = [0, 4, 6].map(frameIndex => projectView(inspector, { kind: "graph", frameIndex }));
	const union = new Map<string, ViewItem>();
	for (const view of views) for (const item of view.items) {
		if (!["entity", "group", "relation"].includes(item.role) || union.has(item.id)) continue;
		// This is a private layout scaffold, never an inspected frame or a trace.
		// It deliberately carries no future event evidence or cell state.
		const { eventIds: _, ...source } = item.source;
		union.set(item.id, { ...item, source, data: { collapsed: false } });
	}
	const scaffold: ViewDescriptor = { kind: "graph", frameId: "@initial", summary: "Layout scaffold only", items: [...union.values()] };
	const { svg } = await renderProof(graphProof(trace, scaffold));
	const positions: number[] = [];
	for (const [index, view] of views.entries()) {
		const present = new Set(view.items.map(item => item.id));
		const host = document.createElement("div"); host.innerHTML = svg;
		for (const node of host.querySelectorAll("[data-thl-item-id]"))
			if (!present.has(node.getAttribute("data-thl-item-id")!)) node.remove();
		document.body.append(host);
		try {
			expect(Boolean(host.querySelector('[data-thl-item-id="node_3"]'))).toBe(index === 1);
			expect(Boolean(host.querySelector('[data-thl-item-id="link_2"]'))).toBe(index === 1);
			positions.push(host.querySelector('[data-thl-item-id="node_2"]')!.getBoundingClientRect().x);
		} finally { host.remove(); }
	}
	expect(new Set(positions).size).toBe(1);
}, 60_000);

it("rejects naive union reuse when a collapsed connector's constituent set and label change", () => {
	const source = distributedGraph();
	source.relations.push({ id: "alternate", from: "gateway", to: "ledger", label: "Alternate route", initiallyPresent: false });
	source.steps[3].events.push({ id: "alternateOn", type: "topology", originId: "author",
		target: "relation", targetId: "alternate", present: true });
	const trace = compileArtifact(source), inspector = inspectTrace(trace);
	const views = [0, 4].map(frameIndex => projectView(inspector, {
		kind: "graph", frameIndex, collapsedGroupIds: ["back"],
	}));
	const connectors = views.map(view => view.items.find(item => item.role === "relation" &&
		item.source.relationIds?.includes("settlement"))!);
	expect(connectors[0].id).toBe(connectors[1].id);
	expect(connectors[0].source.relationIds).toEqual(["settlement"]);
	expect(connectors[1].source.relationIds).toEqual(["settlement", "alternate"]);
	expect(connectors[0].label).not.toBe(connectors[1].label);
	// A raw union SVG retains the old label despite a correct current inspector.
	// Prefer a fresh current-presence structure on topology changes, while
	// caching unchanged topology. Do not hide this failed parity criterion.
});
