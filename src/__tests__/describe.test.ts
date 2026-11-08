import { describe, expect, it } from "vitest";
import { parseProgram } from "../authoring.js";
import { compileProgram } from "../compiler.js";
import { describeFrame } from "../describe.js";
import { parseThl } from "../dsl.js";
import type { Frame } from "../model.js";

const trace = (source: string) =>
	compileProgram(parseProgram(parseThl(source)!));

const SOURCE = [
	"```thl flow",
	'node input "Vector" as array = [1,2,3]',
	'node acc "Accumulator" = 0',
	'link feed input -> acc "add"',
	'step "Load"',
	"  focus input",
	'  note "Vector in memory"',
	'step "Add first"',
	"  focus input[0], acc",
	"  set acc = 1",
	"  send feed = 1",
	'  note "acc grows"',
	"```",
].join("\n");

describe("describeFrame", () => {
	it("names the step position and label first", () => {
		const frames = trace(SOURCE).frames;
		expect(describeFrame(frames[1]!, frames.length)).toBe(
			"Step 2 of 3: Load. Focus on input. Vector in memory",
		);
	});

	it("reads changed values, focus, transfers, and notes in order", () => {
		const frames = trace(SOURCE).frames;
		expect(describeFrame(frames[2]!, frames.length)).toBe(
			"Step 3 of 3: Add first. Accumulator is 1. " +
				"Focus on input[0], acc. " +
				"Send 1 along feed (add) from input to acc. " +
				"acc grows",
		);
	});

	it("lists entity values for the untouched initial state", () => {
		const frames = trace(SOURCE).frames;
		expect(describeFrame(frames[0]!, frames.length)).toBe(
			"Step 1 of 3: Initial state. Vector is [1,2,3]; Accumulator is 0.",
		);
	});

	it("falls back to the raw target for unknown or missing values", () => {
		const frame: Frame = {
			index: 1,
			label: "S",
			state: {
				entities: [{ id: "a", label: "A", value: 1 }],
				relations: [],
				active: ["ghost"],
				changed: ["ghost", "a[9]"],
				transfers: [{ relation: "missing" }],
				notes: [],
			},
			events: [],
		};
		expect(describeFrame(frame, 2)).toBe(
			"Step 2 of 2: S. ghost; a[9]. " +
				"Focus on ghost. Send a signal along missing.",
		);
	});

	it("stays stable without an explicit total", () => {
		const frames = trace(SOURCE).frames;
		expect(describeFrame(frames[0]!)).toBe(
			"Step 1 of 1: Initial state. Vector is [1,2,3]; Accumulator is 0.",
		);
	});

	it("names the empty trace instead of reading nothing", () => {
		const frames = trace("```thl flow\n```").frames;
		expect(frames).toHaveLength(1);
		expect(describeFrame(frames[0]!, 1)).toBe(
			"Step 1 of 1: Initial state. No entities.",
		);
	});
});
