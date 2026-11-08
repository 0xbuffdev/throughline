import { describe, expect, it } from "vitest";
import { compileProgram } from "../../compiler.js";
import { parseThl } from "../../dsl.js";
import { buildBinary, parseBinary } from "../binary.js";

const params = (source: string) => parseBinary(parseThl(source)!);
const build = (source: string) => buildBinary(params(source));

describe("parseBinary", () => {
	it("parses two binary operands", () => {
		expect(params("```thl binary\na = 1011\nb = 0110\n```")).toEqual({
			a: "1011",
			b: "0110",
		});
	});

	it("reports line-aware errors", () => {
		expect(() => params("```thl binary\na = 1011\n```")).toThrowError(
			/needs both a/,
		);
		expect(() => params("```thl binary\na = 102\nb = 0\n```")).toThrowError(
			/Line 2/,
		);
		expect(() =>
			params("```thl binary\na = 1\nb = 0\nc = 1\n```"),
		).toThrowError(/Line 4/);
		expect(() =>
			params("```thl binary\na = 10101010101010101\nb = 0\n```"),
		).toThrowError(/1–16 binary digits/);
	});

	it("accepts operands in either order and ignores blanks and comments", () => {
		expect(
			params("```thl binary\n# operands\n\nb = 0110\n\na = 1011\n```"),
		).toEqual({ a: "1011", b: "0110" });
	});

	it("rejects duplicate operands with the fence line number", () => {
		expect(() =>
			params("```thl binary\na = 1\nb = 0\na = 0\n```"),
		).toThrowError(/Line 4: Duplicate operand "a"/);
		expect(() =>
			params("```thl binary\nb = 1\na = 0\nb = 0\n```"),
		).toThrowError(/Line 4: Duplicate operand "b"/);
	});

	it("rejects malformed operands on either side with the fence line number", () => {
		expect(() => params("```thl binary\na = \nb = 1\n```")).toThrowError(
			/Line 2: Expected a = <bits>/,
		);
		expect(() => params("```thl binary\na = 1\nb = 2\n```")).toThrowError(
			/Line 3: Expected a = <bits>/,
		);
		expect(() => params("```thl binary\nA = 1\nb = 1\n```")).toThrowError(
			/Line 2: Expected a = <bits>/,
		);
	});

	it("preserves operands with leading zeros as written", () => {
		expect(params("```thl binary\na = 0001\nb = 0001\n```")).toEqual({
			a: "0001",
			b: "0001",
		});
	});
});

describe("buildBinary", () => {
	it("ripples carries LSB-first with one beat per bit plus result", () => {
		const program = build("```thl binary\na = 1011\nb = 0110\n```");
		expect(program.beats.map((beat) => beat.label)).toEqual([
			"bit 0",
			"bit 1",
			"bit 2",
			"bit 3",
			"Result",
		]);
		const trace = compileProgram(program);
		expect(trace.frames).toHaveLength(6);
		const end = trace.frames[5]?.state;
		expect(end!.entities.find((e) => e.id === "sum")?.value).toEqual([
			1, 0, 0, 0, 1,
		]);
		expect(end!.entities.find((e) => e.id === "carry")?.value).toBe(1);
		expect(trace.frames[1]?.state.notes).toEqual([
			"bit 0: 1 + 0 + carry 0 = 1, so write 1 and carry 0",
		]);
		expect(trace.frames[5]?.state.notes).toEqual([
			"The last carry becomes the top bit: 1011 + 0110 = 10001",
		]);
	});

	it("handles unequal widths and a zero final carry", () => {
		const program = build("```thl binary\na = 101\nb = 1\n```");
		const trace = compileProgram(program);
		const end = trace.frames.at(-1)?.state;
		expect(end!.entities.find((e) => e.id === "sum")?.value).toEqual([
			0, 1, 1, 0,
		]);
		expect(trace.frames.at(-1)?.state.notes).toEqual([
			"No final carry: 101 + 001 = 0110",
		]);
	});

	it("adds the maximum 16-bit operands with a carry-out", () => {
		const program = build(
			"```thl binary\na = 1111111111111111\nb = 1111111111111111\n```",
		);
		expect(program.beats).toHaveLength(17);
		const trace = compileProgram(program);
		const end = trace.frames.at(-1)?.state;
		expect(end!.entities.find((e) => e.id === "sum")?.value).toEqual([
			1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0,
		]);
		expect(end!.entities.find((e) => e.id === "carry")?.value).toBe(1);
		expect(trace.frames.at(-1)?.state.notes).toEqual([
			"The last carry becomes the top bit: 1111111111111111 + 1111111111111111 = 11111111111111110",
		]);
	});

	it("pads a 1-bit operand against 16 bits", () => {
		const trace = compileProgram(
			build("```thl binary\na = 1\nb = 1111111111111111\n```"),
		);
		const end = trace.frames.at(-1)?.state;
		expect(end!.entities.find((e) => e.id === "sum")?.value).toEqual([
			1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
		]);
	});

	it("adds zero to zero without a carry-out", () => {
		const trace = compileProgram(build("```thl binary\na = 0000\nb = 0\n```"));
		const end = trace.frames.at(-1)?.state;
		expect(end!.entities.find((e) => e.id === "sum")?.value).toEqual([
			0, 0, 0, 0, 0,
		]);
		expect(end!.entities.find((e) => e.id === "carry")?.value).toBe(0);
	});
});
