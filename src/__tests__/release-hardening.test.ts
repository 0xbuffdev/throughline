import { expect, it } from "vitest";
import { compileProgram } from "../compiler.js";
import { composeTrace, projectLayout } from "../layout.js";
import type { Program } from "../model.js";
import { projectScene } from "../scene.js";

/** TL-I16/V-09: timing and heap deltas are diagnostic, never flaky CI cutoffs. */
it("measures deterministic dense cyclic traces at narrow and wide widths", () => {
	const nodes = 120;
	const links = 300;
	const program: Program = {
		version: 1,
		entities: Array.from({ length: nodes }, (_, i) => ({
			id: `node${i}`,
			label: `Service ${i}`,
			value: { status: "pending", attempt: 0 },
			lane: `Zone ${i % 6}`,
		})),
		relations: Array.from({ length: links }, (_, i) => ({
			id: `edge${i}`,
			from: `node${i % nodes}`,
			to: `node${i === 0 ? 0 : (i * 17 + 1) % nodes}`,
		})),
		beats: Array.from({ length: 12 }, (_, i) => ({
			label: `Transition ${i + 1}`,
			events: [
				{ op: "set" as const, target: `node${i}.attempt`, value: i + 1 },
				{ op: "send" as const, relation: `edge${i}`, value: { attempt: i + 1 } },
			],
		})),
	};
	const heapBefore = process.memoryUsage().heapUsed;
	const started = performance.now();
	const trace = compileProgram(program);
	const compileMs = performance.now() - started;
	expect(trace.frames).toHaveLength(13);
	expect(compileProgram(program)).toEqual(trace);
	expect(program.entities[0]?.value).toEqual({ status: "pending", attempt: 0 });
	for (const width of [320, 720]) {
		const start = performance.now();
		const layout = composeTrace(trace, width);
		const layoutMs = performance.now() - start;
		expect(composeTrace(trace, width)).toEqual(layout);
		expect(Object.keys(layout.nodes)).toHaveLength(nodes);
		expect(Object.keys(layout.edges)).toHaveLength(links);
		const scene = projectScene(trace.frames[12]!.state, trace.groups, {
			mode: "focus",
			selectedIds: ["node0"],
		});
		const projected = projectLayout(layout, scene);
		expect(projectLayout(layout, scene)).toEqual(projected);
		expect(scene.nodes.some((node) => node.sourceId === "node0")).toBe(true);
		for (const box of Object.values(layout.nodes)) {
			expect([box.x, box.y, box.w, box.h].every(Number.isFinite)).toBe(true);
			expect(box.x).toBeGreaterThanOrEqual(0);
			expect(box.x + box.w).toBeLessThanOrEqual(layout.width);
			expect(box.y + box.h).toBeLessThanOrEqual(layout.height);
		}
		console.info(JSON.stringify({
			gate: "TL-I16/V-09", width, nodes, links, frames: trace.frames.length,
			compileMs: Number(compileMs.toFixed(2)),
			layoutMs: Number(layoutMs.toFixed(2)),
			heapDeltaBytes: process.memoryUsage().heapUsed - heapBefore,
		}));
	}
});
