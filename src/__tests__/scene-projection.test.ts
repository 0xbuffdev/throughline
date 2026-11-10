import { describe, expect, it } from "vitest";
import { compile } from "../domains/registry.js";
import { EXAMPLES } from "../examples.js";
import { projectLayout, composeTrace } from "../layout.js";
import { projectScene } from "../scene.js";

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
			// Independent oracle: authored visibility, not another projection helper.
			const expectedEntities = frame.state.entities.filter((entity) => !entity.hidden);
			const expectedIds = new Set(expectedEntities.map((entity) => entity.id));
			const expectedRelations = frame.state.relations.filter(
				(relation) =>
					!relation.hidden &&
					expectedIds.has(relation.from) &&
					expectedIds.has(relation.to),
			);
			expect(projection.nodes.map((node) => node.entity)).toEqual(expectedEntities);
			expect(projection.edges.map((edge) => edge.relation)).toEqual(expectedRelations);
			expect(projection.nodes.map((node) => node.sourceId)).toEqual(
				expectedEntities.map((entity) => entity.id),
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
		// A hidden-only selection must show the authored-visible overview.
		expect(projectScene(trace.frames[0].state, trace.groups, {
			mode: "focus",
			selectedIds: ["hidden"],
		}).nodes.map((node) => node.id)).toEqual(["a", "b", "c"]);
	});

	it("falls back to overview when all focus targets are hidden or stale", () => {
		const trace = compile([
			"```thl flow",
			'node hidden "Hidden" hidden = 0',
			'node visible "Visible" = 1',
			'step "Write hidden"',
			'  set hidden = 2',
			"```",
		].join("\n"));
		const initial = trace.frames[0].state;
		const hiddenWrite = trace.frames[1].state;
		expect(hiddenWrite.active).toEqual(["hidden"]);
		for (const state of [initial, hiddenWrite]) {
			const options = [
				{ mode: "focus" as const, selectedIds: ["missing"] },
				{ mode: "focus" as const, focusIds: ["hidden"] },
				{ mode: "focus" as const, selectedIds: ["missing", "hidden"] },
				{ mode: "focus" as const },
			];
			for (const option of options) {
				const projection = projectScene(state, trace.groups, option);
				expect(projection.nodes.map((node) => node.id)).toEqual(["visible"]);
				expect(projection.groups[0]?.sourceEntityIds).toEqual(["visible"]);
			}
		}

		const transition = compile([
			"```thl flow",
			'node visible "Visible" = 0',
			'node other "Other" = 1',
			'step "Hide selected"',
			'  hide node visible',
			'  set visible = 3',
			"```",
		].join("\n"));
		const gone = transition.frames[1].state;
		expect(gone.entities.find((entity) => entity.id === "visible")?.hidden).toBe(true);
		expect(projectScene(gone, transition.groups, {
			mode: "focus",
			selectedIds: ["visible"],
		}).nodes.map((node) => node.id)).toEqual(["other"]);
		expect(projectScene(gone, transition.groups, {
			mode: "focus",
			selectedIds: ["visible", "other"],
		}).nodes.map((node) => node.id)).toEqual(["other"]);
	});

	it("detaches and freezes projection data without freezing compiled snapshots", () => {
		const trace = compile([
			"```thl flow",
			'node a "A" = {"nested":{"items":[1,2]}}',
			'node b "B" = [3,4]',
			'link transfer a -> b "author-defined"',
			'step "Move an annotation"',
			'  send transfer = {"payload":[5,6]}',
			"```",
		].join("\n"));
		const before = structuredClone(trace);
		const state = trace.frames[1].state;
		const scene = projectScene(state);
		const first = scene.nodes.find((node) => node.id === "a")!;
		const edge = scene.edges[0];
		const value = scene.transfers[0].value;
		const nested = first.entity.value as { nested: { items: number[] } };
		expect(first.entity).not.toBe(state.entities[0]);
		expect(edge.relation).not.toBe(state.relations[0]);
		expect(value).not.toBe(state.transfers[0].value);
		expect(Object.isFrozen(scene)).toBe(true);
		expect(Object.isFrozen(first.entity)).toBe(true);
		expect(Object.isFrozen(nested.nested.items)).toBe(true);
		expect(Object.isFrozen(value)).toBe(true);
		expect(() => { nested.nested.items[0] = 999; }).toThrow();
		expect(() => { (edge.relation as { label?: string }).label = "tampered"; }).toThrow();
		expect(() => {
			(value as { payload: number[] }).payload.push(7);
		}).toThrow();
		expect(() => {
			(first.entity as { value: unknown }).value = 99;
		}).toThrow();
		expect(trace).toEqual(before);
		expect(Object.isFrozen(state.entities[0])).toBe(false);
		expect(Object.isFrozen(state.transfers[0].value)).toBe(false);
		expect(projectScene(state)).toEqual(scene);
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
