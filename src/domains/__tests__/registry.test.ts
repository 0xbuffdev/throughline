import { describe, expect, it } from "vitest";
import { ProgramError } from "../../model.js";
import { compile } from "../registry.js";

describe("compile", () => {
	it("routes flow blocks to the authored grammar", () => {
		const trace = compile(
			'```thl flow\nnode a "A" = 1\nstep "go"\n  focus a\n```',
		);
		expect(trace.frames).toHaveLength(2);
		expect(trace.frames[1]?.label).toBe("go");
	});

	it("routes bindings blocks to the computed adapter", () => {
		const trace = compile("```thl bindings\nlet a = 5\nlet b = a\n```");
		expect(trace.frames).toHaveLength(3);
		expect(
			trace.frames[2]?.state.entities.find((e) => e.id === "b")?.value,
		).toBe(5);
	});

	it("routes binary blocks to the computed adapter", () => {
		const trace = compile("```thl binary\na = 1\nb = 1\n```");
		expect(
			trace.frames.at(-1)?.state.entities.find((e) => e.id === "sum")?.value,
		).toEqual([1, 0]);
	});

	it("routes matrix blocks to the computed adapter", () => {
		const trace = compile("```thl matrix\nA = [[1]]\nB = [[2]]\n```");
		expect(
			trace.frames.at(-1)?.state.entities.find((e) => e.id === "C")?.value,
		).toEqual([[2]]);
	});

	it("routes callstack blocks to the computed adapter", () => {
		const trace = compile("```thl callstack\nfact 2\n```");
		expect(
			trace.frames.at(-1)?.state.entities.find((e) => e.id === "returns")
				?.value,
		).toEqual([1, 2]);
	});

	it("rejects non-thl input and unknown domains with line errors", () => {
		expect(() => compile("```python\nprint(1)\n```")).toThrowError(
			ProgramError,
		);
		expect(() => compile('```thl warp\nnode a "A" = 1\n```')).toThrowError(
			/Unknown domain "warp"/,
		);
	});
});
