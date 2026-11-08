import { describe, expect, it } from "vitest";
import { compileProgram } from "../../compiler.js";
import { parseThl } from "../../dsl.js";
import { ProgramError } from "../../model.js";
import { buildBindings, parseBindings } from "../bindings.js";

const params = (source: string) => parseBindings(parseThl(source)!);
const build = (source: string) => buildBindings(params(source));
const entityValue = (
	state: { entities: { id: string; value: unknown }[] } | undefined,
	id: string,
) => state?.entities.find((entity) => entity.id === id)?.value;

describe("parseBindings", () => {
	it("parses the reference copy/alias/push/rebind sequence", () => {
		const { ops } = params(
			"```thl bindings\nlet a = 5\nlet b = a\nb = 9\nconst list = [1, 2]\nconst alias = list\nalias.push(3)\nalias = [7]\n```",
		);
		expect(ops.map((op) => op.kind)).toEqual([
			"declare",
			"declare",
			"assign",
			"declare",
			"declare",
			"push",
			"assign",
		]);
		expect(ops[1]).toMatchObject({ kind: "declare", name: "b", from: "a" });
	});

	it("reports line-aware errors", () => {
		expect(() => params("```thl bindings\nlet a = \n```")).toThrowError(
			/Line 2/,
		);
		expect(() => params("```thl bindings\nb = 9\n```")).toThrowError(
			/Line 2: Unknown variable "b"/,
		);
		expect(() =>
			params("```thl bindings\nlet a = 1\nlet a = 2\n```"),
		).toThrowError(/Line 3: Duplicate variable/);
		expect(() =>
			params("```thl bindings\nlet a = 1\nfrobnicate a\n```"),
		).toThrowError(/Line 3: Unknown statement/);
		expect(() =>
			params("```thl bindings\nlet a = 1\nb = nosuchvar\n```"),
		).toThrowError(/Line 3: Unknown variable "b"/);
	});

	it("rejects referencing or copying an undeclared variable", () => {
		expect(() => params("```thl bindings\nlet b = a\n```")).toThrowError(
			/Line 2: Unknown variable "a"/,
		);
		expect(() => params("```thl bindings\nlet c = ghost\n```")).toThrowError(
			/Line 2: Unknown variable "ghost"/,
		);
		expect(() => params("```thl bindings\nlet a = a\n```")).toThrowError(
			/Line 2: Unknown variable "a"/,
		);
	});

	it("ignores blank lines and comments without shifting line numbers", () => {
		expect(
			params("```thl bindings\n# header\n\nlet a = 1\n\nlet b = a\n```").ops,
		).toMatchObject([{ line: 4 }, { line: 6 }]);
	});

	it("accepts JSON literals nested inside arrays and objects", () => {
		const { ops } = params(
			'```thl bindings\nlet t = [true, false, null]\nlet o = {"a": null, "b": false}\n```',
		);
		expect(ops).toMatchObject([
			{ kind: "declare", value: [true, false, null] },
			{ kind: "declare", value: { a: null, b: false } },
		]);
	});

	it("accepts quoted JSON literals that look like names", () => {
		const { ops } = params('```thl bindings\nlet s = "true"\n```');
		expect(ops).toMatchObject([{ kind: "declare", value: "true" }]);
	});

	it("rejects push arguments that are not JSON values", () => {
		expect(() =>
			params("```thl bindings\nlet l = []\nlet a = 1\nl.push(a)\n```"),
		).toThrowError(/Line 4: Expected push arguments as JSON values/);
	});
});

describe("buildBindings", () => {
	it("copies primitives, aliases references, and shows shared push", () => {
		const program = build(
			"```thl bindings\nlet a = 5\nlet b = a\nb = 9\nconst list = [1, 2]\nconst alias = list\nalias.push(3)\nalias = [7]\n```",
		);
		expect(program.beats).toHaveLength(7);
		const trace = compileProgram(program);
		expect(trace.frames).toHaveLength(8);
		const end = trace.frames[7]?.state;
		expect(entityValue(end, "a")).toBe(5);
		expect(entityValue(end, "b")).toBe(9);
		expect(entityValue(end, "list")).toBe("o1");
		expect(entityValue(end, "alias")).toBe("o2");
		expect(entityValue(end, "o1")).toEqual([1, 2, 3]);
		expect(entityValue(end, "o2")).toEqual([7]);
		// Alias beat carries a packet along the ref edge; push mutates shared state.
		const aliasBeat = trace.frames[5]!;
		expect(aliasBeat.state.transfers.map((t) => t.relation)).toEqual([
			"ref_alias_o1",
		]);
		// Push focuses the mutator, the heap object, and every sharer.
		expect(trace.frames[6]?.state.active).toEqual(["alias", "o1", "list"]);
		expect(
			trace.frames[6]?.state.entities.find((e) => e.id === "o1")?.value,
		).toEqual([1, 2, 3]);
		expect(program.relations.map((r) => r.id).sort()).toEqual([
			"ref_alias_o1",
			"ref_alias_o2",
			"ref_list_o1",
		]);
	});

	it("renders object heaps with the record view", () => {
		const program = build('```thl bindings\nlet o = {"x": 1}\n```');
		expect(program.entities.find((e) => e.id === "o1")).toMatchObject({
			view: "record",
		});
		const trace = compileProgram(program);
		expect(
			trace.frames[1]?.state.entities.find((e) => e.id === "o1")?.value,
		).toEqual({ x: 1 });
	});

	it("rejects push to a primitive with a line error", () => {
		const bad = params("```thl bindings\nlet a = 1\na.push(2)\n```");
		expect(() => buildBindings(bad)).toThrowError(ProgramError);
		expect(() => buildBindings(bad)).toThrowError(/Line 3/);
	});

	it("rejects push onto a heap record", () => {
		const bad = params('```thl bindings\nlet o = {"x": 1}\no.push(2)\n```');
		expect(() => buildBindings(bad)).toThrowError(/Line 3/);
		expect(() => buildBindings(bad)).toThrowError(/not an array/);
	});

	it("rejects push after a heap variable is rebound to a primitive", () => {
		const bad = params("```thl bindings\nlet l = [1]\nl = 5\nl.push(2)\n```");
		expect(() => buildBindings(bad)).toThrowError(/Line 4/);
		expect(() => buildBindings(bad)).toThrowError(/not an array/);
	});

	it("pushes into the current heap object after a rebind to a new array", () => {
		const program = build(
			"```thl bindings\nlet l = [1]\nl = [2]\nl.push(3)\n```",
		);
		const trace = compileProgram(program);
		expect(entityValue(trace.frames.at(-1)?.state, "o1")).toEqual([1]);
		expect(entityValue(trace.frames.at(-1)?.state, "o2")).toEqual([2, 3]);
	});

	it("rebinding one alias leaves the others on the shared object", () => {
		const program = build(
			"```thl bindings\nlet l = [1]\nlet a = l\nlet b = l\na = [9]\nb.push(2)\n```",
		);
		const trace = compileProgram(program);
		const end = trace.frames.at(-1)?.state;
		expect(entityValue(end, "a")).toBe("o2");
		expect(entityValue(end, "b")).toBe("o1");
		expect(entityValue(end, "l")).toBe("o1");
		expect(entityValue(end, "o1")).toEqual([1, 2]);
		expect(entityValue(end, "o2")).toEqual([9]);
		// The push focuses the mutator, the heap object, and the remaining
		// sharer — not the rebound alias.
		const pushBeat = trace.frames.at(-1)?.state;
		expect(pushBeat?.active).toEqual(["b", "o1", "l"]);
	});

	it("copies through a chain of aliases onto the same heap object", () => {
		const program = build(
			"```thl bindings\nlet a = [1]\nlet b = a\nlet c = b\nc.push(2)\n```",
		);
		const trace = compileProgram(program);
		const end = trace.frames.at(-1)?.state;
		expect(entityValue(end, "a")).toBe("o1");
		expect(entityValue(end, "b")).toBe("o1");
		expect(entityValue(end, "c")).toBe("o1");
		expect(entityValue(end, "o1")).toEqual([1, 2]);
	});

	it("sees pushed elements in later copies of the reference", () => {
		const program = build(
			"```thl bindings\nlet l = [1]\nl.push(2)\nlet m = l\nm.push(3)\n```",
		);
		const trace = compileProgram(program);
		const end = trace.frames.at(-1)?.state;
		expect(entityValue(end, "o1")).toEqual([1, 2, 3]);
		expect(trace.frames.at(-2)?.state.notes).toEqual([
			"Copying a reference copies the arrow, not the array. Two names, one object.",
		]);
	});

	it("parses nested JSON values passed to push", () => {
		const program = build(
			'```thl bindings\nlet l = []\nl.push([1, 2], {"a": true}, null)\n```',
		);
		const trace = compileProgram(program);
		const end = trace.frames.at(-1)?.state;
		expect(end!.entities.find((e) => e.id === "o1")?.value).toEqual([
			[1, 2],
			{ a: true },
			null,
		]);
	});
});
