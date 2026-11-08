import { describe, expect, it } from "vitest";
import { compileProgram } from "../compiler.js";
import { tracer } from "../tracer.js";

describe("tracer", () => {
	it("narrates an algorithm and compiles to the same snapshots", () => {
		const t = tracer();
		t.node("arr", "Array", [3, 1, 2], { view: "array" });
		t.link("move", "arr", "arr");
		t.step("Load", (s) => {
			s.focus("arr");
			s.note("Start");
		});
		t.step("Swap", (s) => {
			s.set("arr[0]", 1);
			s.set("arr[1]", 3);
			s.send("move", [1, 3, 2]);
		});
		const program = t.program();
		expect(program.beats).toHaveLength(2);
		const trace = compileProgram(program);
		expect(trace.frames[2]?.state.entities[0]?.value).toEqual([1, 3, 2]);
	});

	it("get reads live state between steps", () => {
		const t = tracer();
		t.node("n", "N", 0);
		t.step("inc", (s) => s.set("n", 1));
		expect(t.get("n")).toBe(1);
		t.step("inc2", (s) => s.set("n", (t.get("n") as number) + 1));
		expect(t.get("n")).toBe(2);
	});
});

describe("tracer ownership", () => {
	it("captures values when recorded, even if the algorithm reuses mutable arrays", () => {
		const t = tracer();
		const values = [1];
		t.node("a", "A", values);
		values.push(2);
		t.step("Append", (s) => {
			s.set("a", values);
			values.push(3);
		});
		const trace = compileProgram(t.program());
		expect(trace.frames[0].state.entities[0].value).toEqual([1]);
		expect(trace.frames[1].state.entities[0].value).toEqual([1, 2]);
	});

	it("keeps returned state and programs from mutating the recording", () => {
		const t = tracer().node("a", "A", [1]);
		(t.get("a") as number[]).push(99);
		const exported = t.program();
		exported.entities[0].value = 7;
		exported.beats.push({ label: "Injected", events: [] });
		expect(t.get("a")).toEqual([1]);
		expect(t.program().beats).toEqual([]);
		expect(t.program().entities[0].value).toEqual([1]);
	});

	it("commits a step atomically when a later write fails", () => {
		const t = tracer().node("a", "A", [1]);
		expect(() =>
			t.step("Broken", (s) => {
				s.set("a[0]", 2);
				s.set("a[9]", 3);
			}),
		).toThrow(/out of range/);
		expect(t.get("a")).toEqual([1]);
		expect(t.program().beats).toEqual([]);
		t.step("Good", (s) => s.set("a[0]", 4));
		expect(t.get("a")).toEqual([4]);
	});

	it("closes step writers when their synchronous callback returns", () => {
		const t = tracer().node("a", "A", 0);
		let write = () => {};
		t.step("Recorded", (s) => {
			write = () => s.set("a", 9);
		});
		expect(write).toThrow(/closed/);
		expect(t.get("a")).toBe(0);
		expect(t.program().beats[0].events).toEqual([]);
	});
});

it("rejects nested recording and leaves the outer step uncommitted", () => {
	const t = tracer().node("a", "A", 0);
	expect(() => t.step("Outer", () => t.node("b", "B", 1))).toThrow(
		/step writer/,
	);
	expect(() => t.step("Outer", () => t.step("Inner", () => {}))).toThrow(
		/step writer/,
	);
	expect(t.program().beats).toEqual([]);
	expect(t.program().entities).toHaveLength(1);
	expect(() => t.step("Async", () => Promise.resolve())).toThrow(/synchronous/);
	expect(t.program().beats).toEqual([]);
});

it("limits entities, events, and steps as they are recorded", () => {
	const t = tracer();
	for (let index = 0; index < 200; index++) t.node(`n${index}`, "Node", 0);
	expect(() => t.node("overflow", "Overflow", 0)).toThrow(/200 entities/);
	expect(() =>
		t.step("Overflow", (s) => {
			for (let index = 0; index < 10_001; index++) s.focus("n0");
		}),
	).toThrow(/10000 events/);
	expect(t.program().beats).toEqual([]);
	for (let index = 0; index < 2000; index++) t.step("Read", () => {});
	expect(() => t.step("Overflow", () => {})).toThrow(/2000 steps/);
});

it("observes rejected async work after rejecting its step", async () => {
	const t = tracer().node("a", "A", 0);
	expect(() =>
		t.step("Async", async (s) => {
			await Promise.resolve();
			s.set("a", 1);
		}),
	).toThrow(/synchronous/);
	// Flush the continuation; an unobserved rejection fails the Vitest run.
	await new Promise<void>((resolve) => setImmediate(resolve));
	expect(t.program().beats).toEqual([]);
	expect(t.get("a")).toBe(0);
});
