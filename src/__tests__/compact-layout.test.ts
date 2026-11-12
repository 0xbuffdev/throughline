import { expect, it } from "vitest";
import { compile } from "../domains/registry.js";
import { EXAMPLES } from "../examples.js";
import { composeTrace } from "../layout.js";
import { routeEdges } from "../layout/edges.js";
import type { Box } from "../layout/types.js";

const overlaps = (a: Box, b: Box) =>
	a.x < b.x + b.w + 3 && a.x + a.w + 3 > b.x &&
	a.y < b.y + b.h + 3 && a.y + a.h + 3 > b.y;

it("reserves no inline edge-label geometry inside entity boxes or competing labels", () => {
	for (const example of EXAMPLES) {
		const trace = compile(example.source);
		for (const width of [320, 375, 720]) {
			const scene = composeTrace(trace, width);
			const reserved: Box[] = [
				...Object.values(scene.nodes),
				...scene.groups.map((group) => ({ x: group.x, y: group.y, w: group.w, h: 24 })),
			];
			for (const relation of trace.frames[0].state.relations) {
				const edge = scene.edges[relation.id];
				if (!relation.label || !edge || edge.labelVisible === false) continue;
				const w = Math.min(20, [...relation.label].length) * 6.5 + 8;
				const label: Box = { x: edge.label[0] - w / 2, y: edge.label[1] - 20, w, h: 16 };
				for (const other of reserved) {
					expect(overlaps(label, other), relation.id + " label overlaps an occupied box at " + width).toBe(false);
				}
				reserved.push(label);
			}
		}
	}
});

it("hides only inline labels when a dense relation cluster has no safe placement", () => {
	const nodes = {
		a: { x: 10, y: 10, w: 80, h: 64 },
		b: { x: 160, y: 10, w: 80, h: 64 },
	};
	const relations = Array.from({ length: 30 }, (_, i) => ({
		id: "relation" + i, from: "a", to: "b", label: "request " + i,
	}));
	const edges = routeEdges(relations, nodes);
	expect(Object.keys(edges)).toHaveLength(relations.length);
	expect(Object.values(edges).some((edge) => edge.labelVisible === false)).toBe(true);
	for (const edge of Object.values(edges)) {
		expect(edge.d).toMatch(/^M/);
		expect(edge.from).toHaveLength(2);
	}
});
