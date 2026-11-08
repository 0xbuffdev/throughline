import { describe, expect, it } from "vitest";
import { compile } from "../../index.js";

describe("public compile API domain boundaries", () => {
	it("preserves leading zeroes when adding a one-bit operand", () => {
		const trace = compile("```thl binary\na = 0000\nb = 1\n```");
		expect(trace.frames).toHaveLength(6);
		const entities = trace.frames.at(-1)?.state.entities;
		expect(entities?.find((entity) => entity.id === "sum")?.value).toEqual([
			0, 0, 0, 0, 1,
		]);
		expect(entities?.find((entity) => entity.id === "carry")?.value).toBe(0);
	});

	it("keeps a copied primitive independent of a later assignment", () => {
		const trace = compile(
			"```thl bindings\nlet original = 1\nlet copy = original\noriginal = 2\n```",
		);
		const entities = trace.frames.at(-1)?.state.entities;
		expect(entities?.find((entity) => entity.id === "original")?.value).toBe(
			2,
		);
		expect(entities?.find((entity) => entity.id === "copy")?.value).toBe(1);
	});

	it("multiplies rectangular matrices with signed fractional entries", () => {
		const trace = compile(
			"```thl matrix\nA = [[-1.5, 0], [0.25, 2]]\nB = [[2], [3]]\n```",
		);
		expect(trace.frames).toHaveLength(3);
		expect(
			trace.frames
				.at(-1)
				?.state.entities.find((entity) => entity.id === "C")?.value,
		).toEqual([[-3], [6.5]]);
	});

	it("unwinds the maximum supported call stack without live frames", () => {
		const trace = compile("```thl callstack\nfact 6\n```");
		expect(trace.frames).toHaveLength(14);
		const entities = trace.frames.at(-1)?.state.entities;
		expect(entities?.find((entity) => entity.id === "returns")?.value).toEqual([
			1, 2, 6, 24, 120, 720,
		]);
		for (let index = 1; index <= 6; index++) {
			expect(
				entities?.find((entity) => entity.id === `slot${index}`)?.value,
			).toBeNull();
		}
	});

	it("reports the original line for an out-of-range call stack depth", () => {
		expect(() =>
			compile("```thl callstack\n# context\n\nfact 7\n```"),
		).toThrowError(/Line 4: Depth n is 1–6/);
	});
});
