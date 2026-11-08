import { describe, expect, it } from "vitest";
import { initialSeek, seekReducer, stepDelayMs } from "../seek.js";

describe("seekReducer", () => {
	it("plays forward and stops at the end", () => {
		let s = { ...initialSeek(2), playing: true };
		s = seekReducer(s, { type: "tick" });
		expect(s.step).toBe(1);
		s = seekReducer(s, { type: "tick" });
		s = seekReducer(s, { type: "tick" });
		expect(s).toMatchObject({ step: 2, playing: false });
	});

	it("toggle restarts from zero when finished", () => {
		let s = { ...initialSeek(2), step: 2, playing: false };
		s = seekReducer(s, { type: "toggle" });
		expect(s).toMatchObject({ step: 0, playing: true });
	});

	it("step clamps and pauses", () => {
		let s = { ...initialSeek(3), playing: true };
		s = seekReducer(s, { type: "step", to: 99 });
		expect(s).toMatchObject({ step: 3, playing: false });
		s = seekReducer(s, { type: "step", to: -2 });
		expect(s.step).toBe(0);
	});

	it("tick is a no-op when paused", () => {
		const s = initialSeek(3);
		expect(seekReducer(s, { type: "tick" })).toBe(s);
	});

	it("speed halves and doubles the cadence", () => {
		expect(stepDelayMs(1500, 2)).toBe(750);
		expect(stepDelayMs(1500, 0.5)).toBe(3000);
		expect(stepDelayMs(1500, 1)).toBe(1500);
	});
});
