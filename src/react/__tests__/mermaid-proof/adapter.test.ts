import { describe, expect, it } from "vitest";
import { compileArtifact } from "../../../v2/compiler.js";
import { inspectTrace } from "../../../v2/inspector.js";
import { projectView } from "../../../v2/views.js";
import { EXAMPLES } from "../../../examples.js";
import { distributedGraph } from "../../../__tests__/v2-graph-fixture.js";
import { retryCheckout } from "../../../__tests__/v2-sequence-fixture.js";
import { graphProof, label, property, sequenceProof } from "../../mermaid/adapter.js";

describe("TL-U26 pure source-to-Mermaid proof", () => {
	for (const example of EXAMPLES) it("preserves every projected graph source for " + example.id, () => {
		const trace = compileArtifact(example.artifact), inspector = inspectTrace(trace);
		const before = JSON.stringify(trace);
		for (let frameIndex = 0; frameIndex < trace.frames.length; frameIndex++) {
			const view = projectView(inspector, { kind: "graph", frameIndex });
			const candidate = graphProof(trace, view);
			expect(candidate.source).toMatch(/^flowchart LR\n/);
			const expected = view.items.filter(item => ["entity", "group", "relation"].includes(item.role));
			expect(candidate.elements.map(item => item.source)).toEqual(expected.map(item => item.source));
			expect(new Set(candidate.elements.map(item => item.id)).size).toBe(expected.length);
			expect(Object.isFrozen(candidate.elements)).toBe(true);
		}
		expect(JSON.stringify(trace)).toBe(before);
	});

	it("reserves participants at initial state without a fabricated note, arrow or transition box", () => {
		const trace = compileArtifact(retryCheckout());
		const view = projectView(inspectTrace(trace), { kind: "sequence", frameIndex: 0 });
		const proof = sequenceProof(trace, view);
		expect(proof.source.split("\n")).toEqual(["sequenceDiagram",
			"participant thl_node_0 as Client", "participant thl_node_1 as Gateway"]);
		expect(proof.totalEvents).toBe(0);
	});
	it("keeps graph layout syntax constant when only state or current-frame evidence changes", () => {
		const trace = compileArtifact(distributedGraph()), inspector = inspectTrace(trace);
		const proofs = [0, 1, 2, 3].map(frameIndex => graphProof(trace,
			projectView(inspector, { kind: "graph", frameIndex })));
		expect(new Set(proofs.map(proof => proof.source)).size).toBe(1);
		expect(proofs[1].elements.find(item => item.source.relationIds?.includes("request"))?.current).toBe(true);
		expect(proofs[2].elements.find(item => item.source.relationIds?.includes("request"))?.current).toBe(false);
	});

	it("keeps removed-member and aggregate evidence on original collapsed sources", () => {
		const source = distributedGraph();
		source.relations.push({ id: "parallel", from: "gateway", to: "ledger", label: "Second route" });
		const trace = compileArtifact(source), inspector = inspectTrace(trace);
		const view = projectView(inspector, { kind: "graph", frameIndex: 6, collapsedGroupIds: ["back"] });
		const proof = graphProof(trace, view);
		const collapsed = proof.elements.find(item => item.source.groupIds?.[0] === "back")!;
		expect(collapsed.source.entityIds).toEqual(["ledger", "worker"]);
		expect(collapsed.source.eventIds).toEqual(["taskOff", "workerOff"]);
		const aggregate = proof.elements.find(item => item.role === "relation" &&
			item.source.relationIds?.includes("settlement"))!;
		expect(aggregate.source.relationIds).toEqual(["settlement", "parallel"]);
		expect(proof.elements.some(item => item.role === "entity" && item.source.entityIds?.includes("worker"))).toBe(false);
		expect(proof.source).not.toContain("thl_node_3[");
	});

	it("emits sends only, preserving independent phases, same-step caveats and no future evidence", () => {
		const source = retryCheckout();
		source.steps[0].events.unshift({ id: "firstReceive", originId: "observer", type: "message",
			relationId: "request", messageId: "order42", phase: "received" });
		const trace = compileArtifact(source), inspector = inspectTrace(trace);
		for (let frameIndex = 0; frameIndex < trace.frames.length; frameIndex++) {
			const view = projectView(inspector, { kind: "sequence", frameIndex });
			const proof = sequenceProof(trace, view, 0, 120);
			const messageItems = view.items.filter(item => item.role === "event" && property(item, "type") === "message");
			expect(proof.elements.filter(item => item.role === "event").map(item => item.source))
				.toEqual(messageItems.map(item => item.source));
			const arrows = proof.source.split("\n").filter(line => line.includes("-)"));
			expect(arrows.length).toBe(messageItems.filter(item => property(item, "phase") === "sent").length);
			expect(proof.source).not.toMatch(/activate|deactivate|loop|alt |par |destroy/);
		}
	});

	it("bounds the window without dropping full-source phase totals", () => {
		const trace = compileArtifact(retryCheckout());
		const view = projectView(inspectTrace(trace), { kind: "sequence", frameIndex: trace.frames.length - 1 });
		const proof = sequenceProof(trace, view, undefined, 3);
		expect(proof.visibleEvents).toBe(3);
		expect(proof.totalEvents).toBe(8);
		expect(proof.start).toBe(5);
		expect(proof.diagnostics).toHaveLength(1);
		expect(sequenceProof(trace, view, 0, 3).start).toBe(0);
		expect(() => sequenceProof(trace, view, 0, 121)).toThrow("1–120");
	});

	it("escapes labels without leaking grammar or directives into new lines", () => {
		const escaped = label('end\n%%{init: {"securityLevel":"loose"}}%%\nA-->B: <img src=x>');
		expect(escaped).not.toMatch(/[\n<>:{}"%]/);
		expect(escaped).toContain("#60;");
	});
});
