import { describe, expect, it } from "vitest";
import { parseProgram } from "../authoring.js";
import { compileProgram, validateProgram } from "../compiler.js";
import { parseThl } from "../dsl.js";
import type { Program } from "../model.js";
import { ProgramError } from "../model.js";

const program = (source: string) => parseProgram(parseThl(source)!);

describe("validateProgram", () => {
	it("rejects conflicting writes in one step", () => {
		const conflict: Program = {
			version: 1,
			entities: [{ id: "a", label: "A", value: [1, 2, 3] }],
			relations: [],
			beats: [
				{
					label: "s",
					events: [
						{ op: "set", target: "a[1]", value: 9 },
						{ op: "set", target: "a[1]", value: 10 },
					],
				},
			],
		};
		expect(() => validateProgram(conflict)).toThrowError(/Conflicting writes/);
	});

	it("rejects unknown set targets and unknown relations", () => {
		const bad: Program = {
			version: 1,
			entities: [],
			relations: [],
			beats: [{ label: "s", events: [{ op: "set", target: "a", value: 1 }] }],
		};
		expect(() => validateProgram(bad)).toThrowError(ProgramError);
	});
});

describe("compileProgram", () => {
	it("materializes per-beat snapshots with changed/active/transfers/notes", () => {
		const ast = program(
			'```thl flow\nnode input "Vector" as array = [1,2,3]\nnode output "Norm" = 0\nlink result input -> output\nstep "Compute"\n  focus input\n  set output = 14\n  send result = 14\n  note "1² + 2² + 3² = 14"\n```',
		);
		const trace = compileProgram(ast);
		expect(trace.frames).toHaveLength(2);
		expect(trace.frames[0]?.state.entities[0]?.value).toEqual([1, 2, 3]);
		expect(trace.frames[1]?.state.changed).toEqual(["output"]);
		expect(trace.frames[1]?.state.active).toEqual(["input", "output"]);
		expect(trace.frames[1]?.state.transfers).toEqual([
			{ relation: "result", value: 14 },
		]);
		expect(trace.frames[1]?.state.notes).toEqual(["1² + 2² + 3² = 14"]);
	});

	it("compiles a full authored block to a stable snapshot", () => {
		const trace = compileProgram(
			program(
				'```thl flow\nnode cache "Cache" as array = [0,0]\nnode hits "Hits" = 0\nlink fill cache -> hits\nstep "Prime"\n  set cache[0] = 1\n  send fill = 1\nstep "Read"\n  focus cache[0]\n  set hits = 1\n  note "hit"\n```',
			),
		);
		expect(trace.frames).toHaveLength(3);
		expect(trace).toMatchSnapshot();
	});
});
