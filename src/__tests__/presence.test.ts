import { describe, expect, it } from "vitest";
import { describeFrame } from "../describe.js";
import { compile } from "../domains/registry.js";
import { visibleScene } from "../scene.js";

const source =
	"```thl flow\n" +
	`
node current "Current" = "old"
node next "Next" hidden = "new"
link replacement current -> next "replaces" hidden
step "Prepare replacement"
  show node next
  show link replacement
  send replacement = "new"
step "Commit"
  hide node current
  hide link replacement
  focus next
` +
	"\n```";

describe("authored presence", () => {
	it("reveals and removes structure without changing earlier snapshots", () => {
		const { frames } = compile(source);
		expect(frames[0]?.state.entities[1]?.hidden).toBe(true);
		expect(frames[0]?.state.relations[0]?.hidden).toBe(true);
		expect(frames[1]?.state.entities[1]?.hidden).toBe(false);
		expect(frames[1]?.state.relations[0]?.hidden).toBe(false);
		expect(frames[2]?.state.entities[0]?.hidden).toBe(true);
		expect(frames[2]?.state.relations[0]?.hidden).toBe(true);
		expect(frames[1]?.state.entities[0]?.hidden).not.toBe(true);
		expect(
			visibleScene(frames[0].state).entities.map((entity) => entity.id),
		).toEqual(["current"]);
		expect(visibleScene(frames[2].state).relations).toEqual([]);
	});

	it("describes visible state and structural changes to nonvisual readers", () => {
		const { frames } = compile(source);
		expect(describeFrame(frames[0]!)).not.toContain("Next is");
		expect(describeFrame(frames[1]!)).toContain("Show Next.");
		expect(describeFrame(frames[2]!)).toContain("Hide Current.");
	});

	it("rejects unknown, ambiguous, and conflicting presence edits with lines", () => {
		expect(() =>
			compile(source.replace("show node next", "show node missing")),
		).toThrow(/Line \d+: Unknown node/);
		expect(() =>
			compile(source.replace("show link replacement", "show link current")),
		).toThrow(/Line \d+: Unknown link/);
		expect(() =>
			compile(
				source.replace("show node next", "show node next\n  hide node next"),
			),
		).toThrow(/Conflicting visibility/);
	});

	it("rejects a transfer whose link or endpoint is hidden after the step", () => {
		expect(() =>
			compile(source.replace("  show link replacement\n", "")),
		).toThrow(/Cannot send along hidden link/);
		expect(() => compile(source.replace("  show node next\n", ""))).toThrow(
			/Cannot send.*hidden node/,
		);
	});

	it("announces revealed values and excludes hidden writes, focus and links", () => {
		const { frames } = compile(
			'```thl flow\nnode answer "Answer" hidden = 42\nnode other "Other" hidden = 0\nlink next answer -> other hidden\nstep "Reveal"\nshow node answer\nshow link next\nstep "Conceal"\nhide node answer\nset answer = 99\n```',
		);
		expect(describeFrame(frames[1])).toContain("Answer is 42");
		expect(describeFrame(frames[1])).not.toContain("Show next");
		expect(describeFrame(frames[2])).toContain("Hide Answer");
		expect(describeFrame(frames[2])).not.toContain("99");
		expect(describeFrame(frames[2])).not.toContain("Focus on answer");
	});
});

describe("reference rebinding", () => {
	it("shows only current pointers after aliasing, rebinding and primitive assignment", () => {
		const { frames } = compile(
			"```thl bindings\nlet a = [1,2]\nlet b = a\nb = [7]\nb = 3\n```",
		);
		const pointers = (step: number) =>
			frames[step]!.state.relations.filter((relation) => !relation.hidden).map(
				(relation) => relation.id,
			);
		expect(pointers(0)).toEqual([]);
		expect(frames[0]?.state.entities.every((entity) => entity.hidden)).toBe(
			true,
		);
		expect(pointers(1)).toEqual(["ref_a_o1"]);
		expect(pointers(2)).toEqual(["ref_a_o1", "ref_b_o1"]);
		expect(pointers(3)).toEqual(["ref_a_o1", "ref_b_o2"]);
		expect(pointers(4)).toEqual(["ref_a_o1"]);
	});
});
