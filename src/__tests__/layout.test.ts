import { describe, expect, it } from "vitest";
import { compileProgram } from "../compiler.js";
import { presentValue } from "../layout/value.js";
import { composeTrace, effectiveView } from "../layout.js";
import { tracer } from "../tracer.js";

describe("scene geometry", () => {
	it("selects supported value views, without silently truncating unsafe integers into bits", () => {
		expect(effectiveView("array", 5)).toBe("number");
		expect(effectiveView("bits", -1)).toBe("number");
		expect(effectiveView("bits", Number.MAX_SAFE_INTEGER + 1)).toBe("number");
		expect(effectiveView("auto", [[1], [2]])).toBe("matrix");
		expect(effectiveView("matrix", [1, 2])).toBe("array");
	});

	it("terminates on cycles and self-loops, routing edges deterministically", () => {
		const t = tracer().node("a", "A", 0).node("b", "B", 0);
		t.link("ab", "a", "b").link("ba", "b", "a").link("aa", "a", "a");
		const trace = compileProgram(t.program());
		const layout = composeTrace(trace, 343);
		expect(Object.keys(layout.edges)).toHaveLength(3);
		for (const edge of Object.values(layout.edges))
			expect(edge.d).toMatch(/^M/);
		expect(composeTrace(trace, 343)).toEqual(layout);
	});

	it("reserves the largest value across history and handles an empty trace", () => {
		const t = tracer().node("acc", "Accumulator", 0);
		t.step("grow", (s) => s.set("acc", [1, 2, 3, 4, 5, 6]));
		const trace = compileProgram(t.program());
		const layout = composeTrace(trace, 343);
		for (const frame of trace.frames) {
			const value = presentValue(frame.state.entities[0], layout.nodes.acc.w);
			expect(value.w).toBeLessThanOrEqual(layout.nodes.acc.w);
			expect(value.h).toBeLessThanOrEqual(layout.nodes.acc.h);
		}
		expect(composeTrace({ version: 1, frames: [] }, 343).nodes).toEqual({});
	});
});

describe("bounded value views", () => {
	it("keeps a focused array element visible and identifies its window", () => {
		const value = Array.from({ length: 100 }, (_, i) => i);
		const shown = presentValue({ id: "a", label: "Array", value }, 240, [[99]]);
		expect(shown.cells.some((cell) => cell.path[0] === 99)).toBe(true);
		expect(shown.cells).toHaveLength(12);
		expect(shown.note).toBe("Items 89–100 of 100");
	});

	it("shows distant matrix coordinates and record keys without losing their identity", () => {
		const matrix = Array.from({ length: 20 }, () =>
			Array.from({ length: 20 }, (_, i) => i),
		);
		const shown = presentValue(
			{ id: "m", label: "Matrix", value: matrix },
			240,
			[[19, 19]],
		);
		expect(
			shown.cells.some((cell) => cell.path[0] === 19 && cell.path[1] === 19),
		).toBe(true);
		expect(shown.note).toMatch(/20\/20/);
		const record = Object.fromEntries(
			Array.from({ length: 20 }, (_, i) => [`key${i}`, i]),
		);
		const fields = presentValue(
			{ id: "r", label: "Record", value: record },
			240,
			[["key19"]],
		);
		expect(fields.cells.some((cell) => cell.path[0] === "key19")).toBe(true);
		expect(fields.note).toBe("Fields 15–20 of 20");
	});

	it("preserves every bit of a safe integer and fits narrow cells", () => {
		const value = Number.MAX_SAFE_INTEGER;
		const shown = presentValue(
			{ id: "bits", label: "Bits", value, view: "bits" },
			220,
		);
		expect(
			Number.parseInt(shown.cells.map((cell) => cell.text).join(""), 2),
		).toBe(value);
		for (const cell of shown.cells)
			expect(cell.x + cell.w).toBeLessThanOrEqual(shown.w);
	});
});

it.each([
	"array",
	"stack",
	"matrix",
	"bits",
] as const)("ignores a nonnumeric focus on a %s without making its value empty", (view) => {
	const value = view === "matrix" ? [[1, 2]] : view === "bits" ? 9 : [1, 2];
	const shown = presentValue({ id: "a", label: "A", value, view }, 240, [
		["missing"],
	]);
	expect(shown.cells.map((cell) => cell.text)).not.toContain("empty");
	expect(shown.cells.length).toBeGreaterThan(0);
});

it("bounds a large matrix without spreading its rows into function arguments", () => {
	const value = Array.from({ length: 150_000 }, () => [1]);
	const shown = presentValue(
		{ id: "large", label: "Large matrix", value, view: "matrix" },
		240,
	);
	expect(shown.cells).toHaveLength(6);
	expect(shown.note).toBe("Rows 1–6/150000 · cols 1–1/1");
});
