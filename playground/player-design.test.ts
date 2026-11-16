import { describe, expect, it } from "vitest";
import { EXAMPLES } from "../src/examples.js";
import { compileArtifact, inspectTrace } from "../src/index.js";
import {
	REVIEW_STATES,
	REVIEW_THEMES,
	REVIEW_WIDTHS,
	makePlayerReviewFixture,
} from "./player-design.js";

describe("TL-P01 design review fixtures", () => {
	it("covers all four source-backed references and the required review environment", () => {
		expect(EXAMPLES).toHaveLength(4);
		expect(REVIEW_WIDTHS).toEqual([260, 320, 375, 768, 1280]);
		expect(REVIEW_THEMES).toEqual(["light", "dark"]);
		expect(REVIEW_STATES).toEqual([
			"initial", "middle", "final", "selected", "inspect", "invalid",
		]);
	});

	for (const reference of EXAMPLES) {
		it("compiles source fixture " + reference.id + " using real semantic contracts", () => {
			const fixture = makePlayerReviewFixture(reference.id, "reference");
			expect(fixture.invalidReason).toBeNull();
			const compiled = compileArtifact(fixture.artifact!);
			expect(compiled.artifact.id).toBe(reference.artifact.id);
			expect(compiled.frames.length).toBe(reference.artifact.steps.length + 1);
		});

		it("long-label fixture does not alter modeled state or event source identity: " + reference.id, () => {
			const baseline = compileArtifact(reference.artifact);
			const fixture = makePlayerReviewFixture(reference.id, "long");
			const changed = compileArtifact(fixture.artifact!);
			const baselineInspector = inspectTrace(baseline);
			const changedInspector = inspectTrace(changed);
			expect(changed.frames).toHaveLength(baseline.frames.length);
			expect(changed.artifact.steps.map(step => step.events))
				.toEqual(baseline.artifact.steps.map(step => step.events));
			for (let index = 0; index < baseline.frames.length; index++) {
				expect(changedInspector.stateAt(index)).toEqual(baselineInspector.stateAt(index));
			}
		});

		it("untitled fixture remains a valid artifact: " + reference.id, () => {
			const fixture = makePlayerReviewFixture(reference.id, "untitled");
			expect(fixture.title).toBeUndefined();
			expect(compileArtifact(fixture.artifact!).artifact.title).toBeUndefined();
		});
	}

	it("never mounts or manufactures a trace from the intentionally invalid fixture", () => {
		const fixture = makePlayerReviewFixture(EXAMPLES[0].id, "invalid");
		expect(fixture.artifact).toBeNull();
		expect(fixture.invalidReason).toContain("intentionally invalid");
	});

	it("rejects unknown references rather than substituting unrelated evidence", () => {
		expect(() => makePlayerReviewFixture("not-a-reference", "reference"))
			.toThrow("Unknown player design reference");
	});
});
