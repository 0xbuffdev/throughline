import { afterEach, describe, expect, it } from "vitest";
import { compileArtifact } from "../../../v2/compiler.js";
import { inspectTrace } from "../../../v2/inspector.js";
import { projectView } from "../../../v2/views.js";
import { EXAMPLES } from "../../../examples.js";
import { distributedGraph } from "../../../__tests__/v2-graph-fixture.js";
import { retryCheckout } from "../../../__tests__/v2-sequence-fixture.js";
import { graphProof, sequenceProof, type DiagramProof } from "../../mermaid/adapter.js";
import { renderProof, retryableLoader } from "../../mermaid/render.js";

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
		for (const line of host.querySelectorAll<SVGLineElement>(".actor-line"))
			expect(Number(line.getAttribute("y2")) - Number(line.getAttribute("y1"))).toBeGreaterThan(120);
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
		expect(host.querySelector('[data-from="thl_node_1"][data-to="thl_node_1"]')
			?.getAttribute("data-thl-motion-item")).toBe(proof.elements.at(-1)?.itemId);
		expect(host.textContent).toMatch(/Local\s*dispatch/);
		expect(proof.elements.at(-1)?.flowLabel).toBe("Local dispatch");
	});

	it("keeps lanes anchored when numeric escapes expand the measured arrow caption", async () => {
		const source = retryCheckout();
		source.relations[0].label = "<<<<<🎆🎆🎆🎆🎆";
		const trace = compileArtifact(source), inspector = inspectTrace(trace);
		const positions = [];
		for (const frameIndex of [0, 1]) {
			const host = await mount(sequenceProof(trace, projectView(inspector, { kind: "sequence", frameIndex })));
			positions.push([...host.querySelectorAll(".actor-line")].map(line => line.getAttribute("x1")));
		}
		expect(positions[1]).toEqual(positions[0]);
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


it("identifies repeated same-endpoint sends, duplicate phases and orphan phases by explicit row reference", async () => {
 const source = retryCheckout();
 source.steps = [{ id: "atomic", label: "Same-step evidence", events: [
  { id: "sendA", originId: "author", type: "message", relationId: "request", messageId: "repeat", phase: "sent" },
  { id: "sendB", originId: "author", type: "message", relationId: "request", messageId: "repeat", phase: "sent" },
  { id: "receiveA", originId: "observer", type: "message", relationId: "request", messageId: "repeat", phase: "received" },
  { id: "receiveB", originId: "observer", type: "message", relationId: "request", messageId: "repeat", phase: "received" },
  { id: "orphanAck", originId: "observer", type: "message", relationId: "request", messageId: "orphan", phase: "acknowledged" },
 ] }];
 for (const reverse of [false, true]) {
  if (reverse) source.steps[0].events.reverse();
  const trace = compileArtifact(source), view = projectView(inspectTrace(trace), { kind: "sequence", frameIndex: 1 });
  for (const [start, size] of [[0, 40], [1, 3], [2, 3]]) {
   const proof = sequenceProof(trace, view, start, size), host = await mount(proof);
   for (const entry of proof.elements.filter(item => item.role === "event")) {
    const mark = host.querySelector(entry.sent ? '[data-thl-motion-item="' + entry.itemId + '"]' :
     '[data-thl-phase-item="' + entry.itemId + '"]');
    expect(mark, entry.source.eventIds?.join()).not.toBeNull();
    const captions = entry.sent ? [...host.querySelectorAll('[data-thl-motion-label="' + entry.itemId + '"]')] : [mark!];
    expect(captions.map(node => node.textContent).join(" ")).toContain(entry.rowToken);
    expect(entry.source.eventIds).toEqual(view.items.find(item => item.id === entry.itemId)?.source.eventIds);
   }
  }
 }
}, 60_000);

it("rejects missing or permuted references and swapped same-endpoint routes in actual SVG", async () => {
 const source = retryCheckout();
 source.steps = [{ id: "same", label: "Repeated evidence", events: [
  { id: "sendA", originId: "author", type: "message", relationId: "request", messageId: "repeat", phase: "sent" },
  { id: "sendB", originId: "author", type: "message", relationId: "request", messageId: "repeat", phase: "sent" },
  { id: "receiveA", originId: "observer", type: "message", relationId: "request", messageId: "repeat", phase: "received" },
  { id: "receiveB", originId: "observer", type: "message", relationId: "request", messageId: "repeat", phase: "received" },
 ] }];
 const trace = compileArtifact(source);
 const proof = sequenceProof(trace, projectView(inspectTrace(trace), { kind: "sequence", frameIndex: 1 }));
 const events = proof.elements.filter(entry => entry.role === "event");
 const [first, second, third, fourth] = events.map(entry => entry.rowToken!);
 const swap = (svg: string, a: string, b: string) => svg.replaceAll(a, "TEMP_REFERENCE").replaceAll(b, a).replaceAll("TEMP_REFERENCE", b);
 await expect(renderProof(proof, undefined, svg => svg.replaceAll(first, "missing"))).rejects.toThrow();
 await expect(renderProof(proof, undefined, svg => swap(svg, first, second))).rejects.toThrow();
 await expect(renderProof(proof, undefined, svg => swap(svg, third, fourth))).rejects.toThrow();
 await expect(renderProof(proof, undefined, svg => {
  const template = document.createElement("template"); template.innerHTML = svg;
  const arrows = [...template.content.querySelectorAll(".messageLine0, .messageLine1")];
  expect(arrows).toHaveLength(2);
  const y = arrows[0].getAttribute("y1")!;
  arrows[0].setAttribute("y1", arrows[1].getAttribute("y1")!);
  arrows[1].setAttribute("y1", y);
  return template.innerHTML;
 })).rejects.toThrow("geometry order");
}, 60_000);

it("coalesces concurrent loader attempts and retries a transient rejection", async () => {
 let calls = 0;
 const load = retryableLoader(async () => { if (++calls === 1) throw new Error("transient"); return "ready"; });
 const a = load(), b = load();
 expect(a).toBe(b);
 await expect(a).rejects.toThrow("transient");
 const retry = load();
 expect(load()).toBe(retry);
 await expect(retry).resolves.toBe("ready");
 expect(load()).toBe(retry);
 expect(calls).toBe(2);
});


it("keeps authored reference-shaped labels and message IDs distinct from trusted row references", async () => {
 const source = retryCheckout();
 source.relations[0].label = "TL000000";
 source.steps = [{ id: "collisions", label: "Reference-shaped evidence", events: [
  { id: "sendA", originId: "author", type: "message", relationId: "request", messageId: "TL000002", phase: "sent" },
  { id: "sendB", originId: "author", type: "message", relationId: "request", messageId: "TL000002", phase: "sent" },
  { id: "receiveA", originId: "observer", type: "message", relationId: "request", messageId: "TL000002", phase: "received" },
  { id: "receiveB", originId: "observer", type: "message", relationId: "request", messageId: "TL000002", phase: "received" },
  { id: "orphan", originId: "observer", type: "message", relationId: "request", messageId: "TL123456", phase: "acknowledged" },
 ] }];
 for (const authoredLabel of ["TL000000", "TL123456", "TL000001x", "TL 000000"]) {
  source.relations[0].label = authoredLabel;
  const trace = compileArtifact(source), view = projectView(inspectTrace(trace), { kind: "sequence", frameIndex: 1 });
  const proof = sequenceProof(trace, view);
  const events = proof.elements.filter(item => item.role === "event");
  const tokens = events.map(item => item.rowToken!);
  expect(new Set(tokens).size).toBe(events.length);
  expect(tokens).not.toContain("TL000002");
  expect(tokens).not.toContain("TL123456");
  const host = await mount(proof);
  for (const entry of events) {
   const mark = host.querySelector(entry.sent ? '[data-thl-motion-item="' + entry.itemId + '"]' :
    '[data-thl-phase-item="' + entry.itemId + '"]');
   expect(mark).not.toBeNull();
   const labels = entry.sent ? [...host.querySelectorAll('[data-thl-motion-label="' + entry.itemId + '"]')] : [mark!];
   const visible = labels.map(node => node.textContent).join(" ");
   expect(visible).toContain(entry.rowToken);
   if (entry.sent) expect(visible.replace(/\s/g, "")).toContain(authoredLabel.replace(/\s/g, ""));
   expect(entry.source).toEqual(view.items.find(item => item.id === entry.itemId)?.source);
  }
  // Even when an authored lookalike remains, removing or duplicating the
  // allocated metadata cannot be mistaken for a valid row.
  await expect(renderProof(proof, undefined, svg => svg.replaceAll(tokens[0], "missing"))).rejects.toThrow();
  await expect(renderProof(proof, undefined, svg => svg.replaceAll(tokens[0], tokens[0] + " " + tokens[0]))).rejects.toThrow();
 }
}, 60_000);
