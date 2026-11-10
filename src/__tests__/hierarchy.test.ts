import { describe, expect, it } from "vitest";
import { compileProgram, validateProgram } from "../compiler.js";
import { compile } from "../domains/registry.js";
import { composeTrace, projectLayout } from "../layout.js";
import { projectScene } from "../scene.js";

const source = [
	"```thl flow",
	'group "Backend" id backend under system as tree',
	'group "Cache" id cache under system as row',
	'group "System" id system as column',
	'group "External" id external as row',
	'node a "Alpha" in "Backend" = 1',
	'node b "Beta" in "Backend" = 2',
	'node c "Cache entry" in "Cache" = 3',
	'node d "External" in "External" = 4',
	'node hidden "Hidden" in "Backend" hidden = 5',
	'link ab a -> b',
	'link ac a -> c',
	'link bc b -> c',
	'link ca c -> a',
	'link ad a -> d',
	'link bd b -> d',
	'link dd d -> d',
	'link hc hidden -> c',
	'step "Transfer"',
	'  send ad = {"payload":"sent"}',
	'step "Hide"',
	'  hide node b',
	"```",
].join("\n");

describe("TL-I14 hierarchical group compatibility", () => {
	it("accepts forward parent references without changing version or flat grammar", () => {
		const trace = compile(source);
		expect(trace.version).toBe(1);
		expect(trace.groups).toEqual([
			{ id: "backend", parentId: "system", name: "Backend", layout: "tree" },
			{ id: "cache", parentId: "system", name: "Cache", layout: "row" },
			{ id: "system", name: "System", layout: "column" },
			{ id: "external", name: "External", layout: "row" },
		]);
		const old = compile('```thl flow\ngroup "A" as tree\nnode a "A" in "A" = 0\n```');
		expect(old.groups).toEqual([{ name: "A", layout: "tree" }]);
		expect(old.frames[0].state.entities[0].lane).toBe("A");
	});

	it("rejects bad identities, parents, cycles and non-typed metadata", () => {
		const invalid = [
			[['group "A" id a under unknown as row'], /unknown explicit parent/],
			[['group "A" id a under a as row'], /hierarchy cycle/],
			[['group "A" id a under b as row', 'group "B" id b under a as row'], /hierarchy cycle/],
			[['group "A" id a as row', 'group "B" id a as row'], /Duplicate group identity/],
			[['group "A" id a as row', 'group "A" id b as row'], /Duplicate group/],
			[['group "A" under parent as row', 'group "Parent" id parent as row'], /needs a name|optional id/],
			[['group "A" id a under parent as row', 'group "Parent" as row'], /unknown explicit parent/],
		] as const;
		for (const [groups, message] of invalid) {
			expect(() => compile(["```thl flow", ...groups, "```"].join("\n"))).toThrow(message);
		}
		const base = {
			version: 1, entities: [], relations: [], beats: [],
			groups: [{ name: "A", layout: "row", id: 123 }],
		};
		expect(() => validateProgram(base)).toThrow(/valid optional id/);
		expect(() => compileProgram({ ...base, groups: [{ name: "A", layout: "row", parentId: "parent" }] }))
			.toThrow(/nested groups require an id/);
	});

	it("projects visible-only collapsed summaries, deduplicated boundary edges and real transfers", () => {
		const trace = compile(source);
		const original = structuredClone(trace);
		const initial = trace.frames[0].state;
		const opts = { collapsedGroupIds: ["backend"] };
		const scene = projectScene(initial, trace.groups, opts);
		expect(scene.nodes.map((node) => node.id)).toEqual(["c", "d", "group:backend"]);
		const summary = scene.nodes.find((node) => node.summaryGroupId === "backend")!;
		expect(summary.sourceEntityIds).toEqual(["a", "b"]);
		expect(summary.entity.value).toBe("2 visible entities");
		expect(scene.groups.find((group) => group.id === "system")?.sourceEntityIds)
			.toEqual(["a", "b", "c"]);
		expect(scene.groups.find((group) => group.id === "backend")?.collapsed).toBe(true);
		expect(scene.edges.some((edge) => edge.sourceRelationIds.includes("ab"))).toBe(false);
		expect(scene.edges.some((edge) => edge.sourceRelationIds.includes("hc"))).toBe(false);
		expect(scene.edges.find((edge) => edge.relation.to === "d" && edge.aggregated)?.sourceRelationIds)
			.toEqual(["ad", "bd"]);
		expect(scene.edges.find((edge) => edge.relation.to === "c" && edge.aggregated)?.sourceRelationIds)
			.toEqual(["ac", "bc"]);
		expect(scene.edges.find((edge) => edge.id === "dd")?.sourceRelationIds).toEqual(["dd"]);

		const transfer = projectScene(trace.frames[1].state, trace.groups, opts);
		expect(transfer.edges.find((edge) => edge.sourceRelationIds.includes("ad"))?.transferred).toBe(true);
		expect(transfer.transfers).toEqual([{
			sourceRelationIds: ["ad"], from: "a", to: "d",
			value: { payload: "sent" }, visible: true,
		}]);
		expect(trace.frames[1].state.entities.find((entity) => entity.id === "d")?.value).toBe(4);
		expect(Object.isFrozen(summary)).toBe(true);
		expect(Object.isFrozen(summary.sourceEntityIds)).toBe(true);
		expect(Object.isFrozen(scene.edges.find((edge) => edge.aggregated)?.sourceRelationIds)).toBe(true);
		expect(projectScene(initial, trace.groups, opts)).toEqual(scene);
		expect(trace).toEqual(original);
	});

	it("supports nested collapse without duplicating links or exposing hidden state", () => {
		const trace = compile(source);
		const scene = projectScene(trace.frames[0].state, trace.groups, {
			collapsedGroupIds: ["system", "backend"],
		});
		expect(scene.nodes.map((node) => node.id)).toEqual(["d", "group:system"]);
		expect(scene.groups.map((group) => group.id)).toEqual(["system", "external"]);
		expect(scene.nodes.find((node) => node.summaryGroupId === "system")?.sourceEntityIds)
			.toEqual(["a", "b", "c"]);
		expect(scene.edges.find((edge) => edge.aggregated)?.sourceRelationIds).toEqual(["ad", "bd"]);
		expect(scene.edges.some((edge) => edge.sourceRelationIds.includes("ac"))).toBe(false);
		const afterHide = projectScene(trace.frames[2].state, trace.groups, {
			collapsedGroupIds: ["backend"],
		});
		expect(afterHide.nodes.find((node) => node.summaryGroupId === "backend")?.sourceEntityIds)
			.toEqual(["a"]);
		expect(afterHide.edges.some((edge) => edge.sourceRelationIds.includes("bd"))).toBe(false);
	});

	it("packs nested geometry stably and routes all aggregate boundaries", () => {
		const trace = compile(source);
		const base = composeTrace(trace, 375);
		expect(composeTrace(trace, 375)).toEqual(base);
		const parent = base.groups.find((group) => group.id === "system")!;
		const child = base.groups.find((group) => group.id === "backend")!;
		expect(child.x).toBeGreaterThanOrEqual(parent.x);
		expect(child.y).toBeGreaterThan(parent.y);
		expect(child.x + child.w).toBeLessThanOrEqual(parent.x + parent.w);
		expect(child.y + child.h).toBeLessThanOrEqual(parent.y + parent.h);
		const before = structuredClone(base);
		for (const index of [0, 1, 2, 0]) {
			const scene = projectScene(trace.frames[index].state, trace.groups, {
				collapsedGroupIds: ["backend"],
			});
			const geometry = projectLayout(base, scene);
			for (const node of scene.nodes) expect(geometry.nodes[node.id]).toBeDefined();
			for (const edge of scene.edges) expect(geometry.edges[edge.id]?.d).toMatch(/^M/);
			expect(projectLayout(base, scene)).toEqual(geometry);
		}
		expect(base).toEqual(before);
	});
});
