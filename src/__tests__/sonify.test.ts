import { describe, expect, it } from "vitest";
import {
	frequencyForStep,
	SONIFY_MAX_HZ,
	SONIFY_MIN_HZ,
	SONIFY_STANDARD_MS,
	sonificationEvent,
} from "../sonify.js";

describe("frequencyForStep", () => {
	it("rests on the floor tone for the first stage", () => {
		expect(frequencyForStep(0, 10)).toBe(SONIFY_MIN_HZ);
	});

	it("lands on the ceiling tone for the final stage", () => {
		expect(frequencyForStep(9, 10)).toBe(SONIFY_MAX_HZ);
	});

	it("ascends monotonically so later stages sound higher", () => {
		const total = 6;
		const tones = Array.from({ length: total }, (_, step) =>
			frequencyForStep(step, total),
		);
		const ascending = tones.every(
			(tone, index) => index === 0 || tone > tones[index - 1]!,
		);
		expect(ascending).toBe(true);
		for (const tone of tones) {
			expect(tone).toBeGreaterThanOrEqual(SONIFY_MIN_HZ);
			expect(tone).toBeLessThanOrEqual(SONIFY_MAX_HZ);
		}
	});

	it("clamps out-of-range steps into the scale", () => {
		expect(frequencyForStep(-3, 10)).toBe(SONIFY_MIN_HZ);
		expect(frequencyForStep(99, 10)).toBe(SONIFY_MAX_HZ);
	});

	it("holds the floor tone when there is no progression", () => {
		expect(frequencyForStep(0, 1)).toBe(SONIFY_MIN_HZ);
		expect(frequencyForStep(0, 0)).toBe(SONIFY_MIN_HZ);
		expect(frequencyForStep(Number.NaN, 10)).toBe(SONIFY_MIN_HZ);
	});

	it("is deterministic for the same stage", () => {
		expect(frequencyForStep(4, 10)).toBe(frequencyForStep(4, 10));
	});
});

describe("sonificationEvent", () => {
	it("carries stage feedback without inferring contention or memory cost", () => {
		expect(sonificationEvent(2, 5)).toEqual({
			step: 2,
			total: 5,
			frequency: frequencyForStep(2, 5),
			durationMs: SONIFY_STANDARD_MS,
		});
	});
});
