import { describe, expect, it } from "vitest";
import { compileProgram } from "../../compiler.js";
import { parseThl } from "../../dsl.js";
import { buildMatrix, parseMatrix } from "../matrix.js";

const params = (source: string) => parseMatrix(parseThl(source)!);
const build = (source: string) => buildMatrix(params(source));

describe("parseMatrix", () => {
	it("parses two grids", () => {
		expect(
			params("```thl matrix\nA = [[1,2],[3,4]]\nB = [[5,6],[7,8]]\n```"),
		).toEqual({
			a: [
				[1, 2],
				[3, 4],
			],
			b: [
				[5, 6],
				[7, 8],
			],
		});
	});

	it("reports line-aware errors", () => {
		expect(() => params("```thl matrix\nA = [[1]]\n```")).toThrowError(
			/needs both A/,
		);
		expect(() =>
			params("```thl matrix\nA = [[1,2]]\nB = [[1],[2],[3]]\n```"),
		).toThrowError(/Inner dimensions mismatch/);
		expect(() =>
			params("```thl matrix\nA = [[1],[x]]\nB = [[1]]\n```"),
		).toThrowError(/Line 2/);
		expect(() =>
			params("```thl matrix\nA = [[1,2,3,4,5]]\nB = [[1]]\n```"),
		).toThrowError(/1–4 rows/);
	});

	it("reports the mismatched dimensions and the B line number", () => {
		expect(() =>
			params("```thl matrix\nA = [[1,2,3]]\nB = [[1,2],[3,4]]\n```"),
		).toThrowError(
			/Line 3: Inner dimensions mismatch: A has 3 columns but B has 2 rows/,
		);
	});

	it("rejects duplicate operands and lowercase operand names", () => {
		expect(() =>
			params("```thl matrix\nA = [[1]]\nA = [[2]]\nB = [[3]]\n```"),
		).toThrowError(/Line 3: Duplicate operand "A"/);
		expect(() =>
			params("```thl matrix\nA = [[1]]\nB = [[2]]\nB = [[3]]\n```"),
		).toThrowError(/Line 4: Duplicate operand "B"/);
		expect(() =>
			params("```thl matrix\na = [[1]]\nB = [[2]]\n```"),
		).toThrowError(/Line 2: Expected A = <grid>/);
	});

	it("rejects empty, ragged, and oversized grids", () => {
		expect(() => params("```thl matrix\nA = []\nB = [[1]]\n```")).toThrowError(
			/1–4 rows/,
		);
		expect(() =>
			params("```thl matrix\nA = [[]]\nB = [[1]]\n```"),
		).toThrowError(/1–4 rows/);
		expect(() =>
			params("```thl matrix\nA = [[1,2],[3]]\nB = [[1],[2]]\n```"),
		).toThrowError(/1–4 rows/);
		expect(() =>
			params("```thl matrix\nA = [[1],[1],[1],[1],[1]]\nB = [[1]]\n```"),
		).toThrowError(/1–4 rows/);
	});

	it("rejects non-number and infinite cells", () => {
		expect(() =>
			params('```thl matrix\nA = [["1",2]]\nB = [[1],[2]]\n```'),
		).toThrowError(/1–4 rows/);
		expect(() =>
			params("```thl matrix\nA = [[true]]\nB = [[1]]\n```"),
		).toThrowError(/1–4 rows/);
		expect(() =>
			params("```thl matrix\nA = [[null]]\nB = [[1]]\n```"),
		).toThrowError(/1–4 rows/);
		expect(() =>
			params("```thl matrix\nA = [[[1]]]\nB = [[1]]\n```"),
		).toThrowError(/1–4 rows/);
		expect(() =>
			params("```thl matrix\nA = [[1e999]]\nB = [[1]]\n```"),
		).toThrowError(/1–4 rows/);
		expect(() =>
			params("```thl matrix\nA = [[NaN]]\nB = [[1]]\n```"),
		).toThrowError(/Expected a JSON grid/);
	});

	it("rejects trailing garbage after the grid JSON", () => {
		expect(() =>
			params("```thl matrix\nA = [[1]] junk\nB = [[2]]\n```"),
		).toThrowError(/Expected a JSON grid/);
	});

	it("accepts operands in either order and ignores blanks and comments", () => {
		expect(
			params(
				"```thl matrix\n# matrices\n\nB = [[5,6],[7,8]]\n\nA = [[1,2],[3,4]]\n```",
			),
		).toEqual({
			a: [
				[1, 2],
				[3, 4],
			],
			b: [
				[5, 6],
				[7, 8],
			],
		});
	});

	it("accepts negative and fractional cells", () => {
		expect(
			params("```thl matrix\nA = [[-1.5, 0],[0.25, 2]]\nB = [[2],[3]]\n```").a,
		).toEqual([
			[-1.5, 0],
			[0.25, 2],
		]);
	});
});

describe("buildMatrix", () => {
	it("multiplies 1×1 matrices in a single beat", () => {
		const program = build("```thl matrix\nA = [[7]]\nB = [[3]]\n```");
		expect(program.beats.map((beat) => beat.label)).toEqual(["C[0][0]"]);
		const trace = compileProgram(program);
		expect(
			trace.frames.at(-1)?.state.entities.find((e) => e.id === "C")?.value,
		).toEqual([[21]]);
	});

	it("supports non-square operands with matching inner dimensions", () => {
		const program = build(
			"```thl matrix\nA = [[1,2,3],[4,5,6]]\nB = [[1],[2],[3]]\n```",
		);
		expect(program.beats.map((beat) => beat.label)).toEqual([
			"C[0][0]",
			"C[1][0]",
		]);
		const trace = compileProgram(program);
		expect(
			trace.frames.at(-1)?.state.entities.find((e) => e.id === "C")?.value,
		).toEqual([[14], [32]]);
	});

	it("multiplies the maximum 4×4 case", () => {
		const identity = "[[1,0,0,0],[0,1,0,0],[0,0,1,0],[0,0,0,1]]";
		const grid = "[[1,2,3,4],[5,6,7,8],[9,10,11,12],[13,14,15,16]]";
		const program = build(
			`\`\`\`thl matrix\nA = ${identity}\nB = ${grid}\n\`\`\``,
		);
		expect(program.beats).toHaveLength(16);
		const trace = compileProgram(program);
		expect(
			trace.frames.at(-1)?.state.entities.find((e) => e.id === "C")?.value,
		).toEqual([
			[1, 2, 3, 4],
			[5, 6, 7, 8],
			[9, 10, 11, 12],
			[13, 14, 15, 16],
		]);
	});

	it("dots one row-column pair per beat in row-major order", () => {
		const program = build(
			"```thl matrix\nA = [[1,2],[3,4]]\nB = [[5,6],[7,8]]\n```",
		);
		expect(program.beats.map((beat) => beat.label)).toEqual([
			"C[0][0]",
			"C[0][1]",
			"C[1][0]",
			"C[1][1]",
		]);
		const trace = compileProgram(program);
		expect(trace.frames).toHaveLength(5);
		const end = trace.frames[4]?.state;
		expect(end.entities.find((e) => e.id === "C")?.value).toEqual([
			[19, 22],
			[43, 50],
		]);
		expect(trace.frames[1]?.state.notes).toEqual([
			"C[0][0] = 5 + 14 = 19. Row 0 of A dot column 0 of B.",
		]);
		// Terms land in the work row; reads travel the row/col edges.
		expect(
			trace.frames[1]?.state.entities.find((e) => e.id === "work")?.value,
		).toEqual([5, 14]);
		expect(
			trace.frames[1]?.state.transfers.map((t) => t.relation).sort(),
		).toEqual(["readA", "readB"]);
	});
});
