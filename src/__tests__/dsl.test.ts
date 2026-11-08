import { describe, expect, it } from "vitest";
import { compile, compileAst, ProgramError, parseThl } from "../index.js";

const FLOW = 'node a "A" = 1\nstep "Read"\nfocus a';

describe("Throughline source", () => {
	it.each([
		"```",
		"````",
		"~~~",
		"~~~~",
	])("compiles a %s fence with CRLF and indentation", (fence) => {
		const source = `  ${fence}thl flow\r\n  ${FLOW.replaceAll("\n", "\r\n  ")}\r\n${fence}  `;
		expect(compile(source).frames[1]?.label).toBe("Read");
	});

	it("accepts a bare header and an unclosed fence through end of input", () => {
		expect(compile(`thl flow\n${FLOW}`)).toEqual(
			compile(`\`\`\`thl flow\n${FLOW}`),
		);
	});

	it("keeps source line numbers across leading blanks and blank body lines", () => {
		expect(() => compile("\n\n```thl flow\n\nfrobnicate\n```")).toThrow(
			"Line 5:",
		);
	});

	it("allows longer matching closing fences and literal backticks in values", () => {
		const trace = compile('```thl flow\nnode a "A" = "```"\n````');
		expect(trace.frames[0]?.state.entities[0]?.value).toBe("```");
	});

	it.each([
		"~~~",
		"``",
		"``` trailing",
	])("does not treat %s as a closing backtick fence", (close) => {
		expect(() => compile(`\`\`\`thl flow\n${FLOW}\n${close}`)).toThrow(
			"Line 5:",
		);
	});

	it("rejects trailing content instead of silently compiling part of a document", () => {
		expect(() => compile(`\`\`\`thl flow\n${FLOW}\n\`\`\`\nprose`)).toThrow(
			/Line 6:.*one Throughline block/,
		);
	});

	it("rejects ignored header options and explains a missing domain", () => {
		expect(() => compile(`thl flow title=demo\n${FLOW}`)).toThrow(/header/);
		expect(() => compile("```thl\n``` ")).toThrow(/Line 1:.*domain/);
	});

	it.each([
		":::thl flow\n:::",
		"```python\npass\n```",
		"    ```thl flow",
	])("does not recognize another language or an indented code block", (source) =>
		expect(parseThl(source)).toBeNull());

	it("compiles parser-owned lines directly and maps errors to document lines", () => {
		expect(
			compileAst({
				kind: "flow",
				lines: FLOW.split("\n"),
				source: { line: 20 },
			}).frames[1]?.source,
		).toEqual({ line: 22 });
		expect(() =>
			compileAst({ kind: "binary", lines: ["a = nope"], source: { line: 20 } }),
		).toThrow(/Line 21:/);
	});

	it.each([
		"binary",
		"matrix",
		"callstack",
	])("locates missing %s operands in the document", (kind) => {
		expect(() => compileAst({ kind, lines: [], source: { line: 20 } })).toThrow(
			/Line 21:/,
		);
	});

	it("locates a callstack error after blank lines and comments", () => {
		expect(() => compile("thl callstack\n\n# recursion\nfact 9")).toThrow(
			/Line 4:/,
		);
	});

	it("rejects invalid source positions from a host parser", () => {
		expect(() =>
			compileAst({ kind: "flow", lines: [], source: { line: 0 } }),
		).toThrow(/Source line/);
	});

	it.each([
		"toString",
		"constructor",
		"__proto__",
	])("rejects inherited domain name %s as a domain diagnostic", (kind) => {
		try {
			compile(`thl ${kind}\n${FLOW}`);
			throw new Error("Expected a compilation error");
		} catch (error) {
			expect(error).toBeInstanceOf(ProgramError);
			expect((error as Error).message).toContain(`Unknown domain "${kind}"`);
		}
	});
});
