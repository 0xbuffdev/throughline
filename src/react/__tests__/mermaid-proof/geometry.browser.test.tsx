import { afterEach, expect, it } from "vitest";
import { compileArtifact } from "../../../v2/compiler.js";
import { inspectTrace } from "../../../v2/inspector.js";
import { projectView } from "../../../v2/views.js";
import { layoutGraph, layoutGraphView } from "../../../v2/graph-layout.js";
import { distributedGraph } from "../../../__tests__/v2-graph-fixture.js";
import { graphProof, sequenceProof } from "../../mermaid/adapter.js";
import { renderProof } from "../../mermaid/render.js";
import { graphWorkload, sequenceWorkload } from "./workloads.js";

const hosts: HTMLElement[] = [];
afterEach(() => hosts.splice(0).forEach(host => host.remove()));
function mount(svg: string, width = 720): HTMLDivElement {
	const host = document.createElement("div");
	host.style.cssText = "width:" + width + "px;max-width:100%;overflow:auto";
	host.innerHTML = svg; document.body.append(host); hosts.push(host);
	return host;
}
const rects = (host: HTMLElement) => [...host.querySelectorAll<SVGGraphicsElement>("[class$=_source]")]
	.map(node => ({ source: node.getAttribute("class"), box: [node.getBBox().x, node.getBBox().y,
		node.getBBox().width, node.getBBox().height], transform: node.getAttribute("transform") }));

it("keeps unchanged topology geometry stable across value/event changes and backward seeking", async () => {
	const trace = compileArtifact(distributedGraph()), inspector = inspectTrace(trace);
	const observations: ReturnType<typeof rects>[] = [];
	for (const frameIndex of [0, 1, 2, 3, 1, 0]) {
		const candidate = graphProof(trace, projectView(inspector, { kind: "graph", frameIndex }));
		const { svg } = await renderProof(candidate);
		observations.push(rects(mount(svg)));
	}
	for (const observed of observations) expect(observed).toEqual(observations[0]);
}, 60_000);

it("records topology-driven relayout instead of claiming stable positions for absent entities", async () => {
	const trace = compileArtifact(distributedGraph()), inspector = inspectTrace(trace);
	const boxes = [];
	for (const frameIndex of [0, 4, 6]) {
		const candidate = graphProof(trace, projectView(inspector, { kind: "graph", frameIndex }));
		const { svg } = await renderProof(candidate), host = mount(svg);
		const worker = host.querySelector(".thl_node_3_source");
		expect(Boolean(worker)).toBe(frameIndex === 4);
		boxes.push({ frameIndex, boxes: rects(host) });
	}
	console.info("TL_U26_TOPOLOGY " + JSON.stringify(boxes));
}, 60_000);

it("retains readable diagram units with horizontal scrolling at 260/320/375/720px", async () => {
	const trace = compileArtifact(distributedGraph());
	const { svg } = await renderProof(graphProof(trace, projectView(inspectTrace(trace), { kind: "graph", frameIndex: 1 })));
	const observations = [];
	for (const width of [260, 320, 375, 720]) {
		const host = mount(svg, width), scene = host.querySelector("svg")!;
		const box = scene.getBoundingClientRect();
		expect(host.clientWidth).toBeLessThanOrEqual(width);
		expect(box.width).toBeGreaterThan(0);
		const text = host.querySelector(".thl_node_0_source text, .thl_node_0_source span")!;
		expect(parseFloat(getComputedStyle(text).fontSize)).toBeGreaterThanOrEqual(12);
		observations.push({ width, viewport: host.clientWidth, diagram: box.width, scrollWidth: host.scrollWidth });
	}
	console.info("TL_U26_WIDTHS " + JSON.stringify(observations));
});

it("measures bounded workloads against native geometry without inventing a performance SLA", async () => {
	const measurements = [];
	for (const [entities, relations] of [[8, 12], [64, 160], [200, 1000]]) {
		const trace = compileArtifact(graphWorkload(entities, relations));
		const view = projectView(inspectTrace(trace), { kind: "graph", frameIndex: 0 });
		let start = performance.now();
		const geometry = layoutGraphView(layoutGraph(trace, 720), view);
		const nativeGeometryMs = performance.now() - start;
		start = performance.now(); const proof = graphProof(trace, view);
		const adapterMs = performance.now() - start;
		start = performance.now();
		try {
			const { svg } = await renderProof(proof);
			const renderMs = performance.now() - start;
			const host = mount(svg);
			expect(host.querySelectorAll("[class$=_source]").length).toBeGreaterThanOrEqual(entities);
			measurements.push({ entities, relations, nativeGeometryMs, adapterMs, renderMs,
				definitionUnits: proof.source.length, svgBytes: new TextEncoder().encode(svg).length,
				nativeWidth: geometry.width, nativeHeight: geometry.height, rendered: true });
		} catch (error) {
			// A failed near-limit case is a finding, not a false passing render.
			measurements.push({ entities, relations, nativeGeometryMs, adapterMs,
				rendered: false, renderMs: performance.now() - start, definitionUnits: proof.source.length,
				error: String(error).slice(0, 300) });
			if (entities < 200) throw error;
		}
	}
	console.info("TL_U26_GRAPH_COST " + JSON.stringify(measurements));
}, 120_000);

it("renders a bounded window of a legal 10,000-event artifact with complete evidence counts", async () => {
	const trace = compileArtifact(sequenceWorkload()), inspector = inspectTrace(trace);
	const start = performance.now();
	const view = projectView(inspector, { kind: "sequence", frameIndex: 100 });
	const proof = sequenceProof(trace, view);
	expect(proof.totalEvents).toBe(10_000); expect(proof.visibleEvents).toBe(40);
	expect(proof.elements.filter(item => item.role === "event")).toHaveLength(40);
	const adapterMs = performance.now() - start;
	const renderStart = performance.now(), { svg } = await renderProof(proof);
	mount(svg);
	console.info("TL_U26_SEQUENCE_COST " + JSON.stringify({ totalEvents: proof.totalEvents,
		visibleEvents: proof.visibleEvents, adapterMs, renderMs: performance.now() - renderStart,
		svgBytes: new TextEncoder().encode(svg).length }));
}, 60_000);
