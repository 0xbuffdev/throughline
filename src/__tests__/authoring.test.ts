import { describe, expect, it } from "vitest";
import { parseProgram } from "../authoring.js";
import { parseThl } from "../dsl.js";
import { ProgramError } from "../model.js";

const program = (source: string) => parseProgram(parseThl(source)!);

describe("parseProgram", () => {
	it("compiles nodes, links, steps, sets, focus, send, note", () => {
		const ast = program(
			'```thl flow\nnode input "Vector" in "Input" as array = [1,2,3]\nnode output "Norm" = 0\nlink result input -> output "reduce"\nstep "Compute"\n  focus input\n  set output = 14\n  send result = 14\n  note "1² + 2² + 3² = 14"\n```',
		);
		expect(ast.entities).toHaveLength(2);
		expect(ast.relations).toHaveLength(1);
		expect(ast.beats).toHaveLength(1);
		expect(ast.beats[0]?.events.map((event) => event.op)).toEqual([
			"focus",
			"set",
			"send",
			"note",
		]);
	});

	it("supports path writes and views", () => {
		const ast = program(
			'```thl flow\nnode a "A" as array = [1,2,3]\nnode b "B" as bits = 5\nstep "go"\n  set a[1] = 9\n  focus a[0], b\n```',
		);
		expect(ast.entities[0]?.view).toBe("array");
		expect(ast.beats[0]?.events[0]).toMatchObject({
			op: "set",
			target: "a[1]",
		});
	});

	it("reports line-aware errors", () => {
		expect(() =>
			program('```thl flow\nnode a "A" as sparkle = 1\n```'),
		).toThrowError(/Line 2: Unknown view/);
		expect(() =>
			program('```thl flow\nnode a "A" = 1\nstep "s"\n  set a..x = 1\n```'),
		).toThrowError(/Line 4: Invalid target/);
		expect(() =>
			program('```thl flow\nstep "s"\n  set a = 1\n```'),
		).toThrowError(ProgramError);
	});
});
