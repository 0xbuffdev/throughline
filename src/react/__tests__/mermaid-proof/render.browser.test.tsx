import { afterEach, describe, expect, it } from "vitest";
import { compileArtifact } from "../../../v2/compiler.js";
import { inspectTrace } from "../../../v2/inspector.js";
import { projectView } from "../../../v2/views.js";
import { EXAMPLES } from "../../../examples.js";
import { distributedGraph } from "../../../__tests__/v2-graph-fixture.js";
import { retryCheckout } from "../../../__tests__/v2-sequence-fixture.js";
import { graphProof, sequenceProof, type DiagramProof } from "./adapter.js";
import { renderProof } from "./render.js";

const hosts: HTMLDivElement[] = [];
afterEach(() => { for (const host of hosts.splice(0)) host.remove(); });
async function mount(proof: DiagramProof): Promise<HTMLDivElement> {
	const { svg } = await renderProof(proof);
	const host = document.createElement("div");
	host.style.cssText = "width:720px;overflow:auto;background:white;color:#0f172a";
	host.innerHTML = svg;
	document.body.append(host); hosts.push(host);
	const box = host.querySelector("svg")!.viewBox.baseVal;
	expect([box.x, box.y, box.width, box.height].every(Number.isFinite)).toBe(true);
	expect(box.width).toBeGreaterThan(0);
	expect(box.height).toBeGreaterThan(0);
	return host;
}

describe("TL-U26 actual Mermaid parser and browser SVG", () => {
	for (const reference of EXAMPLES) it("renders every frame of " + reference.id, async () => {
		const trace = compileArtifact(reference.artifact), inspector = inspectTrace(trace);
		for (let frameIndex = 0; frameIndex < trace.frames.length; frameIndex++) {
			const proof = graphProof(trace, projectView(inspector, { kind: "graph", frameIndex }));
			const host = await mount(proof);
			for (const item of proof.elements.filter(item => item.role === "entity"))
				expect(host.querySelector("." + item.id + "_source"), item.id).not.toBeNull();
			const svg = host.querySelector("svg")!;
				expect(svg.querySelector("script, img, image, a, [onerror], [onclick]")).toBeNull();
			expect(svg.querySelector("animate, animateMotion")).toBeNull();
			host.remove();
		}
	}, 60_000);

	it("renders all participant boundaries before the first message, with no fabricated transition", async () => {
		const trace = compileArtifact(retryCheckout()), inspector = inspectTrace(trace);
		const proof = sequenceProof(trace, projectView(inspector, { kind: "sequence", frameIndex: 0 }));
		const host = await mount(proof);
		expect(host.textContent).toContain("Client");
		expect(host.textContent).toContain("Gateway");
		expect(host.querySelectorAll(".messageText, .noteText")).toHaveLength(0);
	});

	it("renders independent phases without invented return arrows, and permits self-sends", async () => {
		const source = retryCheckout();
		source.relations.push({ id: "self", from: "gateway", to: "gateway", label: "Local dispatch" });
		source.steps.push({ id: "local", label: "Local send", events: [{ id: "localSend", type: "message",
			originId: "author", relationId: "self", messageId: "localJob", phase: "sent" }] });
		const trace = compileArtifact(source), inspector = inspectTrace(trace);
		const proof = sequenceProof(trace, projectView(inspector, { kind: "sequence", frameIndex: 10 }));
		const host = await mount(proof);
		// These private classes are observations in the feasibility test only,
		// never semantic selection or runtime provenance keys.
		expect(host.querySelectorAll(".messageLine0, .messageLine1")).toHaveLength(3);
		expect(host.querySelectorAll(".note")).toHaveLength(6);
		expect(host.textContent).toContain("localJob");
	});

	it("records whether host-authored classes survive on parallel and collapsed source edges", async () => {
		const source = distributedGraph();
		source.relations.push({ id: "parallel", from: "gateway", to: "ledger", label: "Second route" });
		const trace = compileArtifact(source), inspector = inspectTrace(trace);
		const findings = [];
		for (const collapsedGroupIds of [[], ["back"], ["system"]]) {
			const proof = graphProof(trace, projectView(inspector, { kind: "graph", frameIndex: 6, collapsedGroupIds }));
			const host = await mount(proof);
			for (const entry of proof.elements.filter(item => item.role === "relation")) {
				const matches = host.querySelectorAll("." + entry.id + "_source");
				findings.push({ collapsedGroupIds, id: entry.id, mappedElements: matches.length,
					source: entry.source, edgeAttributes: [...host.querySelectorAll("path")].slice(-6)
						.map(path => ({ id: path.id, classes: path.getAttribute("class") })) });
			}
		}
		console.info("TL_U26_EDGE_MAPPING " + JSON.stringify(findings));
	});

	it("keeps hostile labels inert in both diagram grammars", async () => {
		const source = retryCheckout();
		const hostile = 'end\n%%{init:{"securityLevel":"loose"}}%%\n<img src=x onerror=alert(1)>; A-->B';
		for (const entity of source.entities) entity.label = hostile;
		for (const relation of source.relations) relation.label = hostile;
		const trace = compileArtifact(source), inspector = inspectTrace(trace);
		for (const proof of [graphProof(trace, projectView(inspector, { kind: "graph", frameIndex: 1 })),
			sequenceProof(trace, projectView(inspector, { kind: "sequence", frameIndex: 2 }))]) {
			const host = await mount(proof);
			expect(host.querySelector("script, image, img, a, [onerror], [onclick]")).toBeNull();
			expect(host.querySelectorAll("svg")).toHaveLength(1);
		}
	});

	it("displays escaped punctuation as text, including literal entity-looking input", async () => {
		const source = retryCheckout();
		source.entities[0].label = 'Worker\'s "input" <value> & literal &#39;';
		const trace = compileArtifact(source), inspector = inspectTrace(trace);
		for (const proof of [graphProof(trace, projectView(inspector, { kind: "graph", frameIndex: 1 })),
			sequenceProof(trace, projectView(inspector, { kind: "sequence", frameIndex: 0 }))]) {
			const host = await mount(proof);
			const text = [...host.querySelectorAll("text, foreignObject")].map(node => node.textContent).join(" ");
			expect(text.replace(/\s/g, "")).toContain(source.entities[0].label.replace(/\s/g, ""));
			expect(host.querySelector("value, input")).toBeNull();
		}
	});
});
