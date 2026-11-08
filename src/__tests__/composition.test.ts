import { describe, expect, it } from "vitest";
import { compile } from "../domains/registry.js";
import { EXAMPLES } from "../examples.js";
import { presentValue } from "../layout/value.js";
import { composeTrace } from "../layout.js";
import { parseTarget } from "../path.js";

describe("scene composition", () => {
	it("compiles explicit group arrangement independently from trace state", () => {
		const trace = compile(
			'```thl flow\ngroup "Tree" as tree\nnode root "Root" in "Tree" = "ul"\nnode child "Child" in "Tree" = "li"\nlink contains root -> child\n```',
		);
		expect(trace.groups).toEqual([{ name: "Tree", layout: "tree" }]);
		const scene = composeTrace(trace, 360);
		expect(scene.nodes.child.y).toBeGreaterThan(scene.nodes.root.y);
	});

	it.each(EXAMPLES)("keeps $title readable within a narrow viewport", ({
		source,
	}) => {
		const scene = composeTrace(compile(source), 343);
		expect(scene.width).toBeLessThanOrEqual(343);
		for (const node of Object.values(scene.nodes)) {
			expect(node.x).toBeGreaterThanOrEqual(0);
			expect(node.x + node.w).toBeLessThanOrEqual(scene.width);
			expect(node.y + node.h).toBeLessThanOrEqual(scene.height);
		}
	});

	it("rejects invalid or conflicting group arrangements at the source line", () => {
		expect(() => compile('```thl flow\ngroup "Tree" as sparkle\n```')).toThrow(
			/Line 2/,
		);
		expect(() =>
			compile('```thl flow\ngroup "Tree" as row\ngroup "Tree" as column\n```'),
		).toThrow(/Duplicate group/);
	});
});

it("keeps value cells within stable boxes at every example step", () => {
	for (const example of EXAMPLES) {
		const trace = compile(example.source);
		for (const width of [280, 343, 720, 1000]) {
			const scene = composeTrace(trace, width);
			for (const frame of trace.frames) {
				for (const entity of frame.state.entities) {
					const focus = frame.state.active
						.map(parseTarget)
						.flatMap((target) =>
							target?.id === entity.id ? [target.path] : [],
						);
					const value = presentValue(entity, scene.nodes[entity.id].w, focus);
					expect(
						value.h,
						`${example.id}:${entity.id} at ${width}`,
					).toBeLessThanOrEqual(scene.nodes[entity.id].h);
					for (const cell of value.cells)
						expect(cell.x + cell.w).toBeLessThanOrEqual(
							scene.nodes[entity.id].w,
						);
				}
			}
		}
	}
});

it("routes the first matrix operand around the intervening operand", () => {
	const scene = composeTrace(compile(EXAMPLES[2].source), 720);
	const edge = scene.edges.readA;
	expect(edge.from[1]).toBe(scene.nodes.A.y + scene.nodes.A.h);
	expect(edge.to[1]).toBe(scene.nodes.C.y + scene.nodes.C.h);
	expect(edge.label[1]).toBeGreaterThan(scene.nodes.B.y + scene.nodes.B.h);
	expect(edge.label[1]).toBeLessThan(scene.height);
});
