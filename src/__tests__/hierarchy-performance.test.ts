import { expect, it } from "vitest";
import { compileProgram } from "../compiler.js";
import { composeTrace } from "../layout.js";
import type { Program } from "../model.js";

/**
 * V-09 evidence fixture: compare the shipped deterministic flat fallback
 * with the same node/link budget using optional hierarchy metadata.
 * Timings and heap deltas are diagnostics, NOT flaky pass/fail thresholds.
 * No external layout engine is chosen in TL-I14.
 */
it("reports bounded fallback-versus-hierarchy layout baselines (V-09)", () => {
	for (const [label, nodes, links, lanes] of [
		["small", 12, 24, 3],
		["moderate", 75, 200, 5],
		["near-budget", 200, 1000, 8],
	] as const) {
		const entities: Program["entities"] = Array.from({ length: nodes }, (_, i) => ({
			id: `node${i}`,
			label: `Component ${i}`,
			value: { state: `value-${i}`, count: i },
			lane: `Lane ${i % lanes}`,
		}));
		const relations: Program["relations"] = Array.from({ length: links }, (_, i) => ({
			id: `edge${i}`,
			from: `node${i % nodes}`,
			to: `node${(i * 7 + 3) % nodes}`,
		}));
		const groups: NonNullable<Program["groups"]> = [
			{ id: "root", name: "Root", layout: "column" },
			...Array.from({ length: lanes }, (_, i) => ({
				id: `lane${i}`,
				name: `Lane ${i}`,
				parentId: "root",
				layout: "row" as const,
			})),
		];
		const program: Program = {
			version: 1, entities, relations, beats: [],
			groups,
		};
		const nested = compileProgram(program);
		const flat = compileProgram({ ...program, groups: groups.map(({ name, layout }) => ({ name, layout })) });
		const memory = process.memoryUsage().heapUsed;
		const started = performance.now();
		const flatLayout = composeTrace(flat, 720);
		const flatMs = performance.now() - started;
		const hierarchyStart = performance.now();
		const hierarchical = composeTrace(nested, 720);
		const hierarchyMs = performance.now() - hierarchyStart;
		const memoryDelta = process.memoryUsage().heapUsed - memory;
		expect(Object.keys(hierarchical.nodes)).toHaveLength(nodes);
		expect(Object.keys(hierarchical.edges)).toHaveLength(links);
		expect(hierarchical.groups).toHaveLength(lanes + 1);
		expect(hierarchical.width).toBeGreaterThanOrEqual(720);
		expect(hierarchical.height).toBeGreaterThan(0);
		for (const box of Object.values(hierarchical.nodes)) {
			expect(box.x).toBeGreaterThanOrEqual(0);
			expect(box.x + box.w).toBeLessThanOrEqual(hierarchical.width);
			expect(box.y + box.h).toBeLessThanOrEqual(hierarchical.height);
		}
		expect(composeTrace(nested, 720)).toEqual(hierarchical);
		console.info(JSON.stringify({
			gate: "V-09", fixture: label, nodes, links,
			flatMs: Number(flatMs.toFixed(2)),
			hierarchyMs: Number(hierarchyMs.toFixed(2)),
			heapDeltaBytes: memoryDelta,
			flatWidth: flatLayout.width,
			hierarchyWidth: hierarchical.width,
		}));
	}
});
