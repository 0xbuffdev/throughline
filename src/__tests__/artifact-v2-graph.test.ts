import { createHash } from "node:crypto";
import { cpus } from "node:os";
import { describe, expect, it } from "vitest";
import {
	ArtifactCompilationError, compileArtifact, inspectTrace,
	projectView, serializeArtifact, TraceQueryError,
	type ViewDescriptor, type ViewItem, type VisualArtifact,
} from "../index.js";
import { layoutGraph, layoutGraphView } from "../v2/graph-layout.js";
import { distributedGraph } from "./v2-graph-fixture.js";

const model = () => inspectTrace(compileArtifact(distributedGraph()));
const graph = (frameIndex: number, collapsedGroupIds: string[] = [],
	selectedEntityIds: string[] = []): ViewDescriptor =>
	projectView(model(), { kind: "graph", frameIndex, collapsedGroupIds, selectedEntityIds });
const named = (view: ViewDescriptor, role: ViewItem["role"], label: string): ViewItem =>
	view.items.find(item => item.role === role && item.label === label)!;

describe("TL-U05 — v2 graph projection and truthful source identities", () => {
	it("shows present identities only and preserves correct frame source identities", () => {
		const trace = compileArtifact(distributedGraph());
		const query = inspectTrace(trace);
		const initial = projectView(query, { kind: "graph", frameIndex: 0 });
		expect(initial.kind).toBe("graph");
		expect(initial.frameId).toBe("@initial");
		expect(initial.items.filter(item => item.role === "entity")
			.map(item => item.source.entityIds?.[0])).toEqual(["client", "gateway", "ledger"]);
		expect(initial.items.filter(item => item.role === "relation")
			.flatMap(item => item.source.relationIds ?? [])).toEqual(["request", "settlement"]);
		expect(initial.items.filter(item => item.role === "group")
			.flatMap(item => item.source.groupIds?.[0])).toEqual(["system", "front", "back"]);
		expect(initial.items.some(item => item.source.entityIds?.includes("worker") &&
			item.role === "entity")).toBe(false);
		expect(initial.items.some(item => item.source.relationIds?.includes("task") &&
			item.role === "relation")).toBe(false);
		const afterActivation = projectView(query, { kind: "graph", frameIndex: 4 });
		expect(afterActivation.items.filter(item => item.role === "entity")
			.flatMap(item => item.source.entityIds ?? [])).toContain("worker");
		expect(named(afterActivation, "relation", "Task").source.relationIds)
			.toEqual(["task"]);
		expect(named(afterActivation, "relation", "Task").data).toMatchObject({
			sentCurrent: 0,
		});
		const removed = projectView(query, { kind: "graph", frameIndex: 6 });
		expect(removed.items.filter(item => item.role === "entity")
			.flatMap(item => item.source.entityIds ?? [])).not.toContain("worker");
		expect(removed.items.filter(item => item.role === "relation")
			.flatMap(item => item.source.relationIds ?? [])).not.toContain("task");
		expect(query.valueAt(6, "worker", ["task"])).toEqual({
			status: "known", value: "queued",
		}); // declaration retained, though actor currently absent
	});

	it("records sends only when authored as sent, not received, processed or acknowledged", () => {
		const query = model();
		const sent = projectView(query, { kind: "graph", frameIndex: 1 });
		expect(named(sent, "relation", "Request").data).toMatchObject({
			sentCurrent: 1, observedCurrent: 0,
		});
		expect(named(sent, "relation", "Request").source.eventIds).toEqual(["sent"]);
		expect(named(sent, "event", "sent · sent").description)
			.toMatch(/No other message phase or destination persistence is implied/);
		const received = projectView(query, { kind: "graph", frameIndex: 2 });
		expect(named(received, "relation", "Request").data).toMatchObject({
			sentCurrent: 0, observedCurrent: 1,
		});
		expect(named(received, "event", "received · received").source.eventIds)
			.toEqual(["received"]);
		expect(query.valueAt(2, "gateway")).toEqual({
			status: "unknown", reason: "not measured",
		});
		expect(query.valueAt(2, "ledger", ["settled"]))
			.toEqual({ status: "known", value: false });
		const committed = projectView(query, { kind: "graph", frameIndex: 3 });
		expect(named(committed, "relation", "Settlement").data).toMatchObject({
			sentCurrent: 0, observedCurrent: 1,
		});
		expect(named(committed, "event", "processed · processed").source.relationIds)
			.toEqual(["settlement"]);
		expect(query.valueAt(3, "ledger", ["settled"]))
			.toEqual({ status: "known", value: true }); // only the explicit write changed it
		const task = projectView(query, { kind: "graph", frameIndex: 5 });
		expect(named(task, "relation", "Task").data).toMatchObject({
			sentCurrent: 1, observedCurrent: 0,
		});
		expect(named(task, "relation", "Request").data).toMatchObject({
			sentCurrent: 0, observedCurrent: 1,
		}); // the ack is not a new send
	});

	it("uses group collapse only for presentation and retains all internal sources", () => {
		const query = model();
		const before = query.stateAt(1);
		const collapsedFront = projectView(query, {
			kind: "graph", frameIndex: 1,
			collapsedGroupIds: ["front"], selectedEntityIds: ["gateway"],
		});
		const front = named(collapsedFront, "group", "Frontend");
		expect(front.data).toMatchObject({ collapsed: true, selected: true, count: 2 });
		expect(front.source.entityIds).toEqual(["client", "gateway"]);
		expect(front.source.relationIds).toEqual(["request"]);
		expect(front.source.eventIds).toEqual(["sent"]);
		expect(collapsedFront.items.filter(item => item.role === "entity")
			.flatMap(item => item.source.entityIds ?? [])).toEqual(["ledger"]);
		const settlement = named(collapsedFront, "relation", "Settlement");
		expect(settlement.source.relationIds).toEqual(["settlement"]);
		expect(settlement.fromItemId).toBe(front.id);
		expect(settlement.toItemId).toBe(
			named(collapsedFront, "entity", "Ledger").id);
		expect(settlement.data).toMatchObject({ aggregated: true });
		expect(collapsedFront.items.filter(item => item.role === "relation")
			.flatMap(item => item.source.relationIds ?? [])).not.toContain("request");
		// Internal link provenance is on the collapsed summary; it is not
		// redrawn as a fictional self-loop.
		const collapsedSystem = projectView(query, {
			kind: "graph", frameIndex: 1,
			collapsedGroupIds: ["system", "front", "back"],
		});
		const summary = named(collapsedSystem, "group", "Checkout");
		expect(collapsedSystem.items.filter(item => item.role === "group")
			.map(item => item.label)).toEqual(["Checkout"]);
		expect(summary.source.groupIds).toEqual(["system", "front", "back"]);
		expect(summary.source.entityIds).toEqual(["client", "gateway", "ledger"]);
		expect(summary.source.relationIds).toEqual(["request", "settlement"]);
		expect(summary.source.eventIds).toEqual(["sent"]);
		expect(collapsedSystem.items.filter(item => item.role === "relation")).toEqual([]);
		expect(query.stateAt(1)).toBe(before); // no modeled mutation
		expect(projectView(query, { kind: "graph", frameIndex: 1 })
			.items.filter(item => item.role === "entity")).toHaveLength(3);
	});

	it("preserves source IDs for internal entity/relation presence updates under collapse", () => {
		const inspector = model();
		const atActivation = projectView(inspector, {
			kind: "graph", frameIndex: 4, collapsedGroupIds: ["back"],
		});
		const group = named(atActivation, "group", "Backend");
		expect(group.source.entityIds).toEqual(["ledger", "worker"]);
		expect(group.source.relationIds).toEqual(["task"]);
		expect(group.source.eventIds).toEqual(["workerOn", "taskOn"]);
		// The relation's current topology source is not an authored send
		// or independently witnessed receive/acknowledgement.
		const active = projectView(inspector, { kind: "graph", frameIndex: 4 });
		const task = named(active, "relation", "Task");
		expect(task.source.eventIds).toEqual(["taskOn"]);
		expect(task.data).toMatchObject({
			sentCurrent: 0, observedCurrent: 0,
		});
	});

	it("retains absent entity/relation identities and topology-removal events in collapsed summaries", () => {
		const query = model();
		const before = query.stateAt(6);
		const atRemoval = projectView(query, {
			kind: "graph", frameIndex: 6, collapsedGroupIds: ["back"],
		});
		const backend = named(atRemoval, "group", "Backend");
		// Only ledger is modeled present; worker/task remain absent from
		// visible graph nodes and links, even though removal evidence remains.
		expect(backend.data).toMatchObject({ collapsed: true, count: 1 });
		expect(backend.description).toContain("1 present modeled entities");
		expect(backend.description).toContain("removed or absent");
		expect(backend.source.entityIds).toEqual(["ledger", "worker"]);
		expect(backend.source.relationIds).toEqual(["task"]);
		expect(backend.source.eventIds).toEqual(["taskOff", "workerOff"]);
		expect(atRemoval.items.filter(item => item.role === "entity")
			.flatMap(item => item.source.entityIds ?? [])).not.toContain("worker");
		expect(atRemoval.items.filter(item => item.role === "relation")
			.flatMap(item => item.source.relationIds ?? [])).not.toContain("task");
		expect(query.stateAt(6)).toBe(before);
		expect(before.presentEntityIds).not.toContain("worker");
		expect(before.presentRelationIds).not.toContain("task");

		const initial = named(projectView(query, {
			kind: "graph", frameIndex: 0, collapsedGroupIds: ["back"],
		}), "group", "Backend");
		// Absence alone does not manufacture removal evidence.
		expect(initial.source.entityIds).toEqual(["ledger"]);
		expect(initial.source.relationIds).toBeUndefined();
		expect(initial.source.eventIds).toBeUndefined();
	});

	it("keeps event type separate from declared computed, simulated, observed and AI origins", () => {
		const artifact = distributedGraph();
		artifact.origins.push(
			{ id: "simulation", kind: "simulated" },
			{ id: "generator", kind: "ai-proposed" },
			{ id: "calculator", kind: "computed" },
		);
		artifact.steps[3].events[0].originId = "simulation"; // entity topology
		artifact.steps[3].events[1].originId = "generator";  // relation topology
		artifact.steps[1].events[1].originId = "calculator"; // observation-family
		artifact.steps[5].events[0].originId = "witness";    // observed relation removal
		const query = inspectTrace(compileArtifact(artifact));
		const activated = projectView(query, { kind: "graph", frameIndex: 4 });
		const entity = named(activated, "event", "topology · workerOn");
		const relation = named(activated, "event", "topology · taskOn");
		expect(entity.data).toMatchObject({
			type: "topology", originId: "simulation", originKind: "simulated",
		});
		expect(entity.description).toContain("Modeled presence change workerOn");
		expect(entity.description).toContain("Declared origin simulation (simulated)");
		expect(entity.description).toContain("not independent verification");
		expect(entity.source.eventIds).toEqual(["workerOn"]);
		expect(relation.description).toContain("Declared origin generator (ai-proposed)");
		expect(relation.data).toMatchObject({
			originId: "generator", originKind: "ai-proposed",
		});
		expect(activated.items.filter(item => item.role === "event")
			.every(item => !item.description.includes("Authored presence"))).toBe(true);
		const observed = projectView(query, { kind: "state-table", frameIndex: 2 });
		const observation = named(observed, "event", "observation · evidence");
		expect(observation.description).toContain("Observation-family event");
		expect(observation.description).toContain("Declared origin calculator (computed)");
		expect(observation.description).not.toContain("Observed event");
		expect(observation.data).toMatchObject({
			type: "observation", originId: "calculator", originKind: "computed",
		});
		const removed = projectView(query, { kind: "graph", frameIndex: 6 });
		expect(named(removed, "event", "topology · taskOff").description)
			.toContain("Declared origin witness (observed)");
		expect(named(removed, "event", "topology · workerOff").description)
			.toContain("Declared origin author (authored)");
	});

	it("orders nested group panels by ancestry even when children precede parents", () => {
		const artifact = distributedGraph();
		artifact.groups = [
			{ id: "back", label: "Backend", parentId: "system" },
			{ id: "front", label: "Frontend", parentId: "system" },
			{ id: "system", label: "Checkout" },
		];
		const trace = compileArtifact(artifact);
		const query = inspectTrace(trace);
		const projected = projectView(query, { kind: "graph", frameIndex: 0 });
		// The source descriptor remains in declaration order and keeps the
		// exact declared group IDs, while the renderer geometry is paint-sorted.
		expect(projected.items.filter(item => item.role === "group")
			.map(item => item.label)).toEqual(["Backend", "Frontend", "Checkout"]);
		const layout = layoutGraph(trace, 480);
		const visible = layoutGraphView(layout, projected);
		expect(visible.groups.map(group => group.name))
			.toEqual(["Checkout", "Backend", "Frontend"]);
		expect(visible.groups[0].h).toBeGreaterThan(visible.groups[1].h);
		expect(visible.groups[0].y).toBeLessThan(visible.groups[1].y);
		expect(visible.groups[0].y).toBeLessThan(visible.groups[2].y);
		expect(visible.groups.map(group => group.id))
			.toEqual(["group_2", "group_0", "group_1"]);
	});

	it("maps concurrent distinct source links to one collapsed connector without losing IDs", () => {
		const authored = distributedGraph();
		authored.relations.push({
			id: "shadow", from: "client", to: "ledger", label: "Shadow",
		});
		const query = inspectTrace(compileArtifact(authored));
		const projected = projectView(query, {
			kind: "graph", frameIndex: 0, collapsedGroupIds: ["front"],
		});
		const summary = named(projected, "group", "Frontend");
		const ledger = named(projected, "entity", "Ledger");
		const aggregate = projected.items.find(item =>
			item.role === "relation" &&
			item.fromItemId === summary.id && item.toItemId === ledger.id)!;
		expect(aggregate.source.relationIds).toEqual(["settlement", "shadow"]);
		expect(aggregate.data).toMatchObject({ aggregated: true, sentCurrent: 0 });
		expect(projected.items.filter(item => item.role === "relation")
			.flatMap(item => item.source.relationIds ?? [])).toEqual(["settlement", "shadow"]);
	});

	it("emits source-linked deterministic frozen results across seeking and source mutation", () => {
		const input = distributedGraph();
		const query = inspectTrace(compileArtifact(input));
		const first = projectView(query, { kind: "graph", frameIndex: 2,
			selectedEntityIds: ["ledger"], collapsedGroupIds: ["front"] });
		const again = projectView(query, { kind: "graph", frameIndex: 2,
			selectedEntityIds: ["ledger"], collapsedGroupIds: ["front"] });
		expect(again).toEqual(first);
		expect(Object.isFrozen(first)).toBe(true);
		expect(Object.isFrozen(first.items)).toBe(true);
		expect(Object.isFrozen(first.items[0])).toBe(true);
		expect(Object.isFrozen(first.items[0].source)).toBe(true);
		expect(Object.isFrozen(first.items[0].source.groupIds)).toBe(true);
		input.steps.splice(0);
		input.entities[0].label = "CHANGED";
		expect(projectView(query, { kind: "graph", frameIndex: 2,
			selectedEntityIds: ["ledger"], collapsedGroupIds: ["front"] })).toEqual(first);
		expect(() => (first.items as ViewItem[]).push({ id: "fake" } as never))
			.toThrow(TypeError);
		expect(() => (first.items[0].source.groupIds as string[]).push("fake"))
			.toThrow(TypeError);
	});

	it("handles unsupported sequence and empty link hints with an explicit, truthful table fallback", () => {
		const query = model();
		const explicit = projectView(query, { kind: "sequence", frameIndex: 2 });
		expect(explicit.kind).toBe("state-table");
		expect(explicit.diagnostics?.[0]).toContain("TL-U06");
		expect(explicit.items.filter(item => item.role === "event")
			.map(item => item.source.eventIds?.[0])).toEqual(["received", "evidence"]);
		expect(explicit.items.filter(item => item.role === "value")
			.map(item => item.source.entityIds?.[0]))
			.toEqual(["client", "gateway", "ledger", "worker"]);
		expect(named(explicit, "value", "Gateway").description)
			.toContain("Unknown modeled value");
		for (const frameIndex of [0, 1, 2, 6])
			expect(projectView(query, { frameIndex }).kind).toBe("state-table");
		// A graph view hint is stable across seeking and does not convert
		// received evidence into a sent connector.
		const source = distributedGraph();
		source.views = [{ kind: "graph", priority: 0 }];
		const hinted = inspectTrace(compileArtifact(source));
		for (const frameIndex of [0, 1, 3, 6])
			expect(projectView(hinted, { frameIndex }).kind).toBe("graph");
	});

	it("rejects invalid query/view selections and forged inspector objects", () => {
		const query = model();
		const invalid: Array<{ request: unknown; fragment: string }> = [
			{ request: { kind: "network", frameIndex: 1 }, fragment: "$.kind" },
			{ request: { kind: "graph", frameIndex: 1, collapsedGroupIds: ["bogus"] },
				fragment: "$.collapsedGroupIds[0]" },
			{ request: { kind: "graph", frameIndex: 1, selectedEntityIds: ["bogus"] },
				fragment: "$.selectedEntityIds[0]" },
			{ request: { kind: "graph", frameIndex: 1, selectedEntityIds: ["client", "client"] },
				fragment: "$.selectedEntityIds[1]" },
			{ request: { kind: "graph", frameIndex: 99 }, fragment: "$.frameIndex" },
		];
		for (const { request, fragment } of invalid) {
			try {
				projectView(query, request as never);
				throw new Error("expected query rejection");
			} catch (error) {
				expect(error).toBeInstanceOf(TraceQueryError);
				expect((error as TraceQueryError).path).toBe(fragment);
			}
		}
		for (const candidate of [null, {}, { ...query }]) {
			expect(() => projectView(candidate as never, { kind: "graph", frameIndex: 1 }))
				.toThrow(TraceQueryError);
		}
		expect(() => projectView(query, null as never)).toThrow(TraceQueryError);
	});

	it("keeps stable geometry across frames, collapse and mobile width", () => {
		const trace = compileArtifact(distributedGraph());
		const query = inspectTrace(trace);
		const layout = layoutGraph(trace, 320);
		expect(layout.width).toBe(320);
		expect(layout.height).toBeGreaterThan(100);
		const projection = projectView(query, { kind: "graph", frameIndex: 1 });
		const geometry = layoutGraphView(layout, projection);
		const before = projectView(query, { kind: "graph", frameIndex: 0 });
		const initialGeometry = layoutGraphView(layout, before);
		for (const item of projection.items.filter(i => i.role === "entity"))
			expect(geometry.nodes[item.id]).toEqual(initialGeometry.nodes[item.id]);
		const collapsed = projectView(query, { kind: "graph", frameIndex: 1,
			collapsedGroupIds: ["front"] });
		const g = layoutGraphView(layout, collapsed);
		expect(g.nodes[named(collapsed, "group", "Frontend").id]).toBeDefined();
		expect(g.nodes[named(before, "entity", "Client").id]).toBeUndefined();
		for (const item of collapsed.items.filter(i => i.role === "relation")) {
			expect(g.edges[item.id]).toBeDefined();
			expect(item.source.relationIds?.length).toBeGreaterThan(0);
		}
		for (const value of Object.values(layout.nodes))
			expect(value.x + value.w).toBeLessThanOrEqual(layout.width);
	});

	it("indexes auto-view eligibility once when many declared links have absent endpoints", () => {
		// This legal shape defeats naive per-seek scans: 1,000 relation IDs
		// remain modeled present, but every endpoint remains absent. Each
		// frame would trigger another full relation-array linear search.
		const stepCount = 1_200;
		const fixture: VisualArtifact = {
			schemaVersion: 2,
			id: "absentEndpoints",
			origins: [{ id: "author", kind: "authored" }],
			entities: Array.from({ length: 150 }, (_, i) =>
				({ id: "actor" + i, label: "Actor " + i, initiallyPresent: false })),
			relations: Array.from({ length: 1_000 }, (_, i) =>
				({ id: "relation" + i, from: "actor0", to: "actor1" })),
			initialState: Object.fromEntries(Array.from({ length: 150 }, (_, i) =>
				["actor" + i, { status: "known" as const, value: 0 }])),
			steps: Array.from({ length: stepCount }, (_, i) =>
				({ id: "empty" + i, label: "No modeled operation", events: [] })),
		};
		const fixtureSHA256 = createHash("sha256")
			.update(serializeArtifact(fixture)).digest("hex");
		const trace = compileArtifact(fixture);
		const query = inspectTrace(trace);
		expect(trace.frames).toHaveLength(stepCount + 1);
		expect(query.stateAt(0).presentRelationIds).toHaveLength(1_000);
		expect(query.stateAt(0).presentEntityIds).toHaveLength(0);

		const started = performance.now();
		for (const frameIndex of [0, 1, 600, 1200, 0, 1200]) {
			const view = projectView(query, { frameIndex });
			expect(view.kind).toBe("state-table");
			expect(view.frameId).toBe(frameIndex === 0 ? "@initial" : "empty" + (frameIndex - 1));
			expect(view.items.filter(item => item.role === "relation")).toHaveLength(0);
		}
		console.info("TL-U05 absent-endpoints view-index benchmark:", JSON.stringify({
			fixtureSHA256, steps: stepCount, relations: 1_000, entities: 150,
			runtime: process.version, platform: process.platform,
			cpu: cpus()[0]?.model ?? "unknown",
			firstBuildAndSixProjectionsMs: Number((performance.now() - started).toFixed(1)),
		}));
	}, 60_000);

	it("benchmarks near-maximum graph routing with source-linked 1,000 relations", () => {
		const source: VisualArtifact = {
			schemaVersion: 2,
			id: "maxGraph",
			origins: [{ id: "author", kind: "authored" }],
			entities: Array.from({ length: 200 }, (_, i) =>
				({ id: "actor" + i, label: "Actor " + i })),
			relations: Array.from({ length: 1000 }, (_, i) =>
				({ id: "rel" + i, from: "actor" + (i % 200),
					to: "actor" + ((i * 31 + 7) % 200) })),
			initialState: Object.fromEntries(Array.from({ length: 200 }, (_, i) =>
				["actor" + i, { status: "known", value: 0 }])),
			steps: [],
		};
		const digest = createHash("sha256").update(serializeArtifact(source)).digest("hex");
		const start = performance.now();
		const trace = compileArtifact(source);
		const query = inspectTrace(trace);
		const layout = layoutGraph(trace, 720);
		const projection = projectView(query, { kind: "graph", frameIndex: 0 });
		const drawn = layoutGraphView(layout, projection);
		const duration = performance.now() - start;
		expect(projection.items.filter(i => i.role === "entity")).toHaveLength(200);
		expect(projection.items.filter(i => i.role === "relation")).toHaveLength(1000);
		expect(Object.keys(drawn.edges)).toHaveLength(1000);
		console.info("TL-U05 graph layout benchmark:", JSON.stringify({
			fixtureSHA256: digest, entities: 200, relations: 1000,
			node: process.version, platform: process.platform,
			cpu: cpus()[0]?.model ?? "unknown",
			compileProjectRouteMs: Number(duration.toFixed(1)),
		}));
	}, 60_000);
});
