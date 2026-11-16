import { expect, it } from "vitest";
import { compileArtifact } from "../v2/compiler.js";
import { layoutGraph, layoutGraphView } from "../v2/graph-layout.js";
import { inspectTrace } from "../v2/inspector.js";
import { projectView } from "../v2/views.js";
import type { VisualArtifact } from "../v2/model.js";

function artifact(): VisualArtifact {
	return { schemaVersion: 2, id: "layout", origins: [{ id: "author", kind: "authored" }],
		entities: ["section", "ul", "li"].map(id => ({ id, label: id })),
		relations: [{ id: "root", from: "section", to: "ul" }, { id: "child", from: "ul", to: "li" }],
		initialState: { section: { status: "known", value: 1 }, ul: { status: "known", value: [] }, li: { status: "unknown" } },
		steps: [{ id: "write", label: "Write", events: [{ id: "value", originId: "author", type: "write", entityId: "ul", path: [], value: { status: "known", value: "a long value that must never resize during seeking" } }] }],
	};
}

it("sizes short labels compactly and reserves stable bounded boxes for the full trace", () => {
	const trace = compileArtifact(artifact());
	const q = inspectTrace(trace);
	for (const width of [260, 375, 720]) {
		const layout = layoutGraph(trace, width);
		expect(layout.nodes.node_0.w).toBeLessThan(100);
		expect(layout.nodes.node_0.h).toBe(52);
		const before = layoutGraphView(layout, projectView(q, { kind: "graph", frameIndex: 0 }));
		const after = layoutGraphView(layout, projectView(q, { kind: "graph", frameIndex: 1 }));
		expect(before.nodes).toEqual(after.nodes);
		for (const box of Object.values(before.nodes)) {
			expect(box.w).toBeLessThanOrEqual(188);
			expect(box.x).toBeGreaterThanOrEqual(0);
			expect(box.x + box.w).toBeLessThanOrEqual(width);
			expect(box.x + box.w / 2).toBeCloseTo(width / 2);
		}
		expect(before.nodes.node_0.y).toBeLessThan(before.nodes.node_1.y);
		expect(before.nodes.node_1.y).toBeLessThan(before.nodes.node_2.y);
	}
});

it("centers incomplete rows without overlap when cycles use the stable grid fallback", () => {
	const source = artifact();
	source.relations.push({ id: "cycle", from: "li", to: "section" });
	const trace = compileArtifact(source);
	for (const width of [160, 260, 720]) {
		const layout = layoutGraph(trace, width);
		const rows = new Map<number, typeof layout.nodes[string][]>();
		for (const box of Object.values(layout.nodes)) rows.set(box.y, [...(rows.get(box.y) ?? []), box]);
		for (const row of rows.values()) {
			const left = Math.min(...row.map(b => b.x)), right = Math.max(...row.map(b => b.x + b.w));
			expect((left + right) / 2).toBeCloseTo(width / 2);
			for (let i = 1; i < row.length; i++) expect(row[i].x).toBeGreaterThan(row[i - 1].x + row[i - 1].w);
		}
	}
});

it("separates parallel and reciprocal links while retaining every source relation", () => {
	const source = artifact();
	source.relations.push({ id: "parallel", from: "section", to: "ul" }, { id: "reverse", from: "ul", to: "section" });
	const trace = compileArtifact(source);
	const view = projectView(inspectTrace(trace), { kind: "graph", frameIndex: 0 });
	const geometry = layoutGraphView(layoutGraph(trace), view);
	expect(Object.keys(geometry.edges)).toHaveLength(4);
	expect(new Set(Object.values(geometry.edges).map(edge => edge.d)).size).toBe(4);
	expect(view.items.filter(i => i.role === "relation").flatMap(i => i.source.relationIds)).toEqual(source.relations.map(r => r.id));
});
