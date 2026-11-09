import { describe, expect, it } from "vitest";
import { compileProgram, validateProgram } from "../compiler.js";
import { createBudget } from "../limits.js";
import { ProgramError } from "../model.js";

const nested = (depth: number): unknown => {
	let value: unknown = "leaf";
	for (let index = 0; index < depth; index++) value = [value];
	return value;
};

const program = (value: unknown) => ({
	version: 1,
	entities: [{ id: "a", label: "A", value }],
	relations: [],
	beats: [],
});

describe("v0.0.2 version-1 boundary evidence", () => {
	it("accepts 32 nested value levels and rejects 33 at program validation", () => {
		expect(() => validateProgram(program(nested(32)))).not.toThrow();
		expect(() => validateProgram(program(nested(33)))).toThrow(ProgramError);
	});

	it("keeps the broader work-budget traversal limit separate from value validation", () => {
		expect(() => createBudget("Work", 1_000_000)(nested(64))).not.toThrow();
		expect(() => createBudget("Work", 1_000_000)(nested(65))).toThrow(
			/JSON nesting exceeds the compilation limit/,
		);
	});

	it("rejects unsupported program versions and emits trace version 1", () => {
		expect(() => validateProgram({ ...program(null), version: 2 })).toThrow(
			/Expected version: 1/,
		);
		expect(compileProgram(program(null)).version).toBe(1);
	});
});
