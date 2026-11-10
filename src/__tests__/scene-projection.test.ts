import { describe, expect, it } from "vitest";
import { compile } from "../domains/registry.js";
import { EXAMPLES } from "../examples.js";
import { projectLayout, composeTrace } from "../layout.js";
import { projectScene, visibleScene } from "../scene.js";

const source = `\`\`\`thl flow
group "First" as tree
group "Second" as column
node a "A" in "First" = 0
node b "B" in "First" = 1
node c "C" in "Second" = 2
node hidden "Hidden" hidden = 3
link ab a -> b
link ba b -> a
link aa a -> a
link bc b -> c
link ah a -> hidden
step "Send"
  focus b
  send ab = "payload"
step "Remove"
  hide node a
  focus c
\`\`\``;

describe("pure scene projection (TL-I12)", () => {
	it("matches legacy visibility in overview and preserves source identities", () => {
		const trace = compile(source);
		for (const frame of trace.frames) {
			const projection = projectScene(frame.state, trace.groups);
			const visible = visibleScene(frame.state);
			expect(projection.nodes.map((node) => node.entity)).toEqual(visible.entities);
			expect(projection.edges.map((edge) => edge.relation)).toEqual(visible.relations);
			expect(projection.nodes.map((node) => node.sourceId)).toEqual(
				visible.entities.map((entity) => entity.id),
			);
			for (const edge of projection.edges)
				expect(edge.sourceRelationIds).toEqual([edge.relation.id]);
			expect(projectScene(frame.state, trace.groups)).toEqual(projection);
		}
		const initial = projectScene(trace.frames[0].state, trace.groups);
		expect(initial.groups).toEqual([
			{ id: "First", name: "First", layout: "tree", sourceEntityIds: ["a", "b"] },
			{ id: "Second", name: "Second", layout: "column", sourceEntityIds: ["c"] },
		]);
		expect(initial.edges.map((edge) => edge.id)).toEqual(["ab", "ba", "aa", "bc"]);
	});

	it("filters presentation focus without changing compiled frames", () => {
		const trace = compile(source);
		const before = structuredClone(trace);
		const state = trace.frames[0].state;
		const selected = projectScene(state, trace.groups, {
			mode: "focus",
			selectedIds: ["a"],
		});
		expect(selected.nodes.map((node) => node.id)).toEqual(["a"]);
		expect(selected.edges.map((edge) => edge.id)).toEqual(["aa"]);
		expect(selected.nodes[0]).toMatchObject({
			selected: true,
			focused: false,
			sourceId: "a",
		});

		const explicitlyFocused = projectScene(state, trace.groups, {
			mode: "focus",
			focusIds: ["b", "c"],
		});
		expect(explicitlyFocused.nodes.map((node) => node.id)).toEqual(["b", "c"]);
		expect(explicitlyFocused.edges.map((edge) => edge.id)).toEqual(["bc"]);
		expect(explicitlyFocused.groups.map((group) => group.sourceEntityIds)).toEqual([
			["b"],
			["c"],
		]);
		expect(projectScene(state, trace.groups, { mode: "focus" })).toEqual(
			projectScene(state, trace.groups),
		);
		expect(trace).toEqual(before);
	});

	it("retains true transfer endpoints and provenance, not a destination write", () => {
		const trace = compile(source);
		const state = trace.frames[1].state;
		const before = structuredClone(state);
		const view = projectScene(state, trace.groups, { mode: "focus" });
		expect(view.nodes.map((node) => node.id)).toEqual(["a", "b"]);
		expect(view.nodes.find((node) => node.id === "b")?.focused).toBe(true);
		expect(view.edges.find((edge) => edge.id === "ab")).toMatchObject({
			sourceRelationIds: ["ab"],
			transferred: true,
		});
		expect(view.transfers).toEqual([
			{
				sourceRelationIds: ["ab"],
				from: "a",
				to: "b",
				value: "payload",
				visible: true,
			},
		]);
		expect(state.entities.find((entity) => entity.id === "b")?.value).toBe(1);
		expect(state).toEqual(before);

		const offscreen = projectScene(state, trace.groups, {
			mode: "focus",
			selectedIds: ["c"],
		});
		// The transfer remains part of the authored active pathway.
		expect(offscreen.transfers[0].visible).toBe(true);
		expect(offscreen.nodes.map((node) => node.id)).toEqual(["a", "b", "c"]);
	});

	it("honors system-hidden nodes, links, and transfer boundaries in every view", () => {
		const trace = compile(source);
		const last = trace.frames[2].state;
		const result = projectScene(last, trace.groups, {
			mode: "focus",
			selectedIds: ["a", "hidden", "c"],
		});
		expect(result.nodes.map((node) => node.id)).toEqual(["c"]);
		expect(result.edges).toEqual([]);
		expect(result.groups.map((group) => group.name)).toEqual(["Second"]);
		expect(result.nodes[0].focused).toBe(true);
		expect(result.transfers).toEqual([]);
		expect(projectScene(trace.frames[0].state, trace.groups, {
			mode: "focus",
			selectedIds: ["hidden"],
		}).nodes).toEqual([]);
	});

	it("keeps fallback geometry stable with cycles, self loops, and hidden endpoints", () => {
		const trace = compile(source);
		const base = composeTrace(trace, 343);
		const baseBefore = structuredClone(base);
		for (const frame of trace.frames) {
			for (const options of [
				{ mode: "overview" as const },
				{ mode: "focus" as const, selectedIds: ["a"] },
				{ mode: "focus" as const, selectedIds: ["b", "c"] },
			]) {
				const scene = projectScene(frame.state, trace.groups, options);
				const layout = projectLayout(base, scene);
				expect(projectLayout(base, scene)).toEqual(layout);
				expect(layout.viewBox).toBe(base.viewBox);
				for (const node of scene.nodes)
					expect(layout.nodes[node.id]).toEqual(base.nodes[node.sourceId]);
				for (const edge of scene.edges) {
					expect(layout.edges[edge.id]).toEqual(base.edges[edge.id]);
					expect(layout.edges[edge.id]?.d).toMatch(/^M/);
				}
				expect(Object.keys(layout.nodes)).toEqual(scene.nodes.map((node) => node.id));
				expect(Object.keys(layout.edges)).toEqual(scene.edges.map((edge) => edge.id));
			}
		}
		expect(base).toEqual(baseBefore);
	});

	it("handles empty states, all-hidden state, and dense reference traces deterministically", () => {
		const empty = compile('```thl flow\n```');
		expect(projectScene(empty.frames[0].state)).toEqual({
			nodes: [], edges: [], groups: [], transfers: [],
		});
		expect(projectLayout(composeTrace(empty), projectScene(empty.frames[0].state)).nodes).toEqual({});
		for (const example of EXAMPLES.filter((item) =>
			["reconciliation", "distributed-checkout"].includes(item.id)
		)) {
			const trace = compile(example.source);
			const base = composeTrace(trace, 480);
			const order = [trace.frames.length - 1, 0, 1, trace.frames.length - 1];
			const projections = order.map((index) =>
				projectScene(trace.frames[index].state, trace.groups, { mode: "focus" }),
			);
			expect(projections[0]).toEqual(projections[3]);
			expect(projectLayout(base, projections[0])).toEqual(
				projectLayout(base, projections[3]),
			);
			for (const projection of projections) {
				const ids = new Set(projection.nodes.map((node) => node.id));
				for (const edge of projection.edges) {
					expect(ids.has(edge.relation.from)).toBe(true);
					expect(ids.has(edge.relation.to)).toBe(true);
				}
			}
		}
	});
});
