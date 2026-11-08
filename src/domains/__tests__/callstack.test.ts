import { describe, expect, it } from "vitest";
import { compileProgram } from "../../compiler.js";
import { parseThl } from "../../dsl.js";
import { buildCallstack, parseCallstack } from "../callstack.js";

const params = (source: string) => parseCallstack(parseThl(source)!);
const build = (source: string) => buildCallstack(params(source));

describe("parseCallstack", () => {
	it("parses fact depth", () => {
		expect(params("```thl callstack\nfact 4\n```")).toEqual({ n: 4 });
	});

	it("reports line-aware errors", () => {
		expect(() => params("```thl callstack\nfact 0\n```")).toThrowError(
			/Depth n is 1–6/,
		);
		expect(() => params("```thl callstack\nfact 7\n```")).toThrowError(
			/Depth n is 1–6/,
		);
		expect(() => params("```thl callstack\nfib 4\n```")).toThrowError(
			/Expected fact/,
		);
		expect(() => params("```thl callstack\nfact 4\nfact 3\n```")).toThrowError(
			/one line/,
		);
	});

	it("rejects empty input and malformed depths", () => {
		expect(() => params("```thl callstack\n```")).toThrowError(/one line/);
		expect(() => params("```thl callstack\nfact\n```")).toThrowError(
			/Expected fact/,
		);
		expect(() => params("```thl callstack\nfact 4.5\n```")).toThrowError(
			/Expected fact/,
		);
		expect(() => params("```thl callstack\nfact -1\n```")).toThrowError(
			/Expected fact/,
		);
		expect(() =>
			params("```thl callstack\nfact 999999999999\n```"),
		).toThrowError(/Depth n is 1–6/);
		expect(() => params("```thl callstack\nFACT 3\n```")).toThrowError(
			/Expected fact/,
		);
	});

	it("ignores blank lines and comments", () => {
		expect(
			params("```thl callstack\n# factorial of two\n\nfact 2\n```"),
		).toEqual({
			n: 2,
		});
	});
});

describe("buildCallstack", () => {
	it("handles the minimal case, fact 1", () => {
		const program = build("```thl callstack\nfact 1\n```");
		expect(program.beats.map((beat) => beat.label)).toEqual([
			"call fact(1)",
			"return fact(1)",
			"done",
		]);
		const trace = compileProgram(program);
		expect(
			trace.frames.at(-1)?.state.entities.find((e) => e.id === "returns")
				?.value,
		).toEqual([1]);
	});

	it("handles the maximum depth, fact 6", () => {
		const program = build("```thl callstack\nfact 6\n```");
		expect(program.beats.map((beat) => beat.label)).toEqual([
			"call fact(6)",
			"call fact(5)",
			"call fact(4)",
			"call fact(3)",
			"call fact(2)",
			"call fact(1)",
			"return fact(1)",
			"return fact(2)",
			"return fact(3)",
			"return fact(4)",
			"return fact(5)",
			"return fact(6)",
			"done",
		]);
		const trace = compileProgram(program);
		expect(
			trace.frames.at(-1)?.state.entities.find((e) => e.id === "returns")
				?.value,
		).toEqual([1, 2, 6, 24, 120, 720]);
		expect(trace.frames.at(-1)?.state.notes).toEqual([
			"The stack is empty again. fact(6) = 720.",
		]);
	});

	it("pushes n frames then unwinds with returns", () => {
		const program = build("```thl callstack\nfact 4\n```");
		expect(program.beats.map((beat) => beat.label)).toEqual([
			"call fact(4)",
			"call fact(3)",
			"call fact(2)",
			"call fact(1)",
			"return fact(1)",
			"return fact(2)",
			"return fact(3)",
			"return fact(4)",
			"done",
		]);
		const trace = compileProgram(program);
		expect(trace.frames).toHaveLength(10);
		const end = trace.frames[9]?.state;
		expect(end.entities.find((e) => e.id === "returns")?.value).toEqual([
			1, 2, 6, 24,
		]);
		// Every frame slot is empty again after the unwind.
		for (const entity of end.entities)
			if (entity.id.startsWith("slot")) expect(entity.value).toBeNull();
		expect(trace.frames[6]?.state.notes).toEqual([
			"fact(2) gets 1 back and returns 2 × 1 = 2.",
		]);
		expect(trace.frames[6]?.state.transfers).toEqual([
			{ relation: "ret2", value: 2 },
		]);
		expect(trace.frames[9]?.state.notes).toEqual([
			"The stack is empty again. fact(4) = 24.",
		]);
	});
});
