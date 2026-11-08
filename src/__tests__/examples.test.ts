import { describe, expect, it } from "vitest";
import { compile } from "../domains/registry.js";
import { EXAMPLES } from "../examples.js";

describe("reference explanations", () => {
	it.each(EXAMPLES)("compiles $title as an inspectable trace", ({ source }) => {
		const { frames } = compile(source);
		expect(frames.length).toBeGreaterThan(2);
		expect(frames.slice(1).every((frame) => frame.state.notes.length > 0)).toBe(
			true,
		);
	});

	it("prepares a keyed replacement without prematurely changing the current tree", () => {
		const { frames } = compile(EXAMPLES[0].source);
		const initial = frames[0]!.state;
		const final = frames.at(-1)!.state;
		expect(
			initial.entities.find((entity) => entity.id === "added")?.hidden,
		).toBe(true);
		expect(final.entities.find((entity) => entity.id === "added")?.hidden).toBe(
			false,
		);
		expect(final.entities.find((entity) => entity.id === "b")).toEqual(
			initial.entities.find((entity) => entity.id === "b"),
		);
		expect(
			final.entities.find((entity) => entity.id === "changes")?.value,
		).toEqual(["remove b", "insert c"]);
	});
});
