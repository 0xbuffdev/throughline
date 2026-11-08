import { describe, expect, it } from "vitest";
import {
	compile,
	compileAst,
	compileProgram,
	ProgramError,
	validateProgram,
} from "../index.js";
import type { Program } from "../model.js";

const program = (value: unknown) => ({
	version: 1 as const,
	entities: [{ id: "a", label: "A", value }],
	relations: [],
	beats: [],
});

describe("bounded compilation", () => {
	it("rejects oversized text before parsing it, including parser-owned lines", () => {
		const body = "#".repeat(300_000);
		expect(() => compile(`thl flow\n${body}`)).toThrow(/source.*limit/i);
		expect(() => compileAst({ kind: "flow", lines: [body] })).toThrow(
			/source.*limit/i,
		);
	});

	it("rejects cyclic and exponentially expanded values as controlled diagnostics", () => {
		const cyclic: unknown[] = [];
		cyclic.push(cyclic);
		expect(() => validateProgram(program(cyclic))).toThrow(ProgramError);
		let shared: unknown = [0];
		for (let index = 0; index < 18; index++) shared = [shared, shared];
		expect(() => compileProgram(program(shared))).toThrow(/Program.*limit/);
	});

	it("rejects oversized events before walking their validation branches", () => {
		const input = program(0);
		expect(() =>
			validateProgram({
				...input,
				beats: [
					{
						label: "Busy",
						events: Array(10_001).fill({ op: "focus", targets: ["a"] }),
					},
				],
			}),
		).toThrow(/events/);
	});

	it("caps expanded snapshots even when the compact input is within its limit", () => {
		const input: Program = {
			...program("x".repeat(20_000)),
			entities: [{ id: "a", label: "A", value: "x".repeat(20_000) }],
			beats: Array.from({ length: 1000 }, (_, index) => ({
				label: `Read ${index}`,
				events: [{ op: "focus", targets: ["a"] }],
				source: { line: index + 3 },
			})),
		};
		expect(() => validateProgram(input)).not.toThrow();
		expect(() => compileProgram(input)).toThrow(/Line \d+:.*Trace.*limit/);
	});

	it("preserves a representative large trace and detaches it from its input", () => {
		const input: Program = {
			version: 1,
			entities: Array.from({ length: 40 }, (_, i) => ({
				id: `n${i}`,
				label: `Node ${i}`,
				value: [0, 1, 2],
			})),
			relations: [],
			beats: Array.from({ length: 300 }, (_, i) => ({
				label: `Step ${i}`,
				events: [{ op: "set", target: `n${i % 40}[0]`, value: i }],
			})),
		};
		const trace = compileProgram(input);
		input.entities[0].value = "changed externally";
		expect(trace.frames).toHaveLength(301);
		expect(trace.frames[0].state.entities[0].value).toEqual([0, 1, 2]);
		expect(JSON.parse(JSON.stringify(trace))).toEqual(trace);
	});
});

it("guards computed data before adapter label serialization", () => {
	const deep = `${"[".repeat(10_000)}0${"]".repeat(10_000)}`;
	expect(() => compile(`thl bindings\nlet a = ${deep}`)).toThrow(ProgramError);
});

it("limits computed expansion while the adapter records it", () => {
	const source = `thl bindings\nlet a = []\n${"a.push(0)\n".repeat(1000)}`;
	expect(() => compile(source)).toThrow(/Program.*limit/);
});

it("caps computed steps before the bindings discovery pass", () => {
	expect(() =>
		compile(`thl bindings\nlet a = []\n${"a.push(0)\n".repeat(2000)}`),
	).toThrow(/Line 2002:.*2000 steps/);
});
