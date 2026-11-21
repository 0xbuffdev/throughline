import { afterEach, expect, it } from "vitest";
import { compileArtifact } from "../../../v2/compiler.js";
import { inspectTrace } from "../../../v2/inspector.js";
import { projectView } from "../../../v2/views.js";
import { distributedGraph } from "../../../__tests__/v2-graph-fixture.js";
import { retryCheckout } from "../../../__tests__/v2-sequence-fixture.js";
import { graphProof, sequenceProof } from "../../mermaid/adapter.js";
import { renderProof } from "../../mermaid/render.js";
import { animateTransfers } from "../../mermaid/motion.js";

const hosts: HTMLDivElement[] = [];
afterEach(() => hosts.splice(0).forEach(host => host.remove()));
const mount = (svg: string) => {
	const host = document.createElement("div"); host.innerHTML = svg;
	document.body.append(host); hosts.push(host); return host;
};

it("moves a directional graph arrow and its label along the modeled route, then cancels immediately", async () => {
	const trace = compileArtifact(distributedGraph());
	const proof = graphProof(trace, projectView(inspectTrace(trace), { kind: "graph", frameIndex: 1 }));
	const host = mount((await renderProof(proof)).svg), svg = host.querySelector("svg")!;
	const cancel = animateTransfers(host, proof, 1000, true, false);
	expect(host.querySelectorAll("[data-thl-transfer]")).toHaveLength(1);
	expect(host.querySelectorAll("animateMotion")).toHaveLength(2);
	expect(host.querySelector("[data-thl-transfer] text")?.textContent).toBe("Request");
	svg.pauseAnimations();
	const start = svg.getCurrentTime();
	svg.setCurrentTime(start + .1);
	const moving = host.querySelector<SVGGElement>("[data-thl-transfer] > g")!;
	const before = moving.getCTM()!;
	svg.setCurrentTime(start + .6);
	const after = moving.getCTM()!;
	expect(Math.hypot(after.e - before.e, after.f - before.f)).toBeGreaterThan(10);
	for (const animation of host.querySelectorAll("animateMotion")) expect(animation.getAttribute("repeatCount")).toBe("1");
	cancel(); expect(host.querySelectorAll("[data-thl-transfer], animateMotion")).toHaveLength(0);
}, 60_000);

it("animates explicit Sequence sends with labels, and never turns receipt-only evidence into motion", async () => {
	const trace = compileArtifact(retryCheckout()), inspector = inspectTrace(trace);
	for (const frameIndex of [1, 2]) {
		const proof = sequenceProof(trace, projectView(inspector, { kind: "sequence", frameIndex }));
		const host = mount((await renderProof(proof)).svg);
		const cancel = animateTransfers(host, proof, 600, true, false);
		expect(host.querySelectorAll("[data-thl-transfer]")).toHaveLength(frameIndex === 1 ? 1 : 0);
		if (frameIndex === 1) expect(host.querySelector("[data-thl-transfer] text")?.textContent).toBe("Checkout request · order42");
		cancel();
	}
}, 60_000);

it("does not animate backward/seek navigation or reduced motion", async () => {
	const trace = compileArtifact(distributedGraph());
	const proof = graphProof(trace, projectView(inspectTrace(trace), { kind: "graph", frameIndex: 1 }));
	const host = mount((await renderProof(proof)).svg);
	for (const [forward, reducedMotion] of [[false, false], [true, true]]) {
		const cancel = animateTransfers(host, proof, 600, forward, reducedMotion);
		expect(host.querySelector("animateMotion")).toBeNull(); cancel();
	}
});
