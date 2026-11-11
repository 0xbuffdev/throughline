import { describe, expect, it } from "vitest";
import { compile } from "../domains/registry.js";
import { CHECKOUT_GUIDANCE, CHECKOUT_SCENARIOS } from "../examples.js";
import { validateGuidance } from "../react/guidance.js";

const recovery = compile(CHECKOUT_SCENARIOS[2].source);

describe("authored guided explanations", () => {
	it("references existing events and actual state changes in the recovery trace", () => {
		expect(() => validateGuidance(recovery, CHECKOUT_GUIDANCE)).not.toThrow();
		expect(recovery.frames[8]?.label).toBe("Timeout without confirmation");
		expect(recovery.frames[8]?.events[0]?.op).toBe("set");
		expect(recovery.frames[14]?.label).toBe("Persist payment confirmation");
		expect(recovery.frames[14]?.events[1]?.op).toBe("set");
	});

	it("rejects stale, overlapping and unsupported authored evidence", () => {
		expect(() => validateGuidance(recovery, {
			chapters: [{ id: "one", title: "First", start: 0, end: 2 },
				{ id: "two", title: "Overlaps", start: 2, end: 3 }],
		})).toThrow(/disjoint/);
		expect(() => validateGuidance(recovery, {
			chapters: [{ id: "one", title: "Missing", start: 0, end: 10000 }],
		})).toThrow(/missing frame/);
		const causal = CHECKOUT_GUIDANCE.causalLinks[0];
		expect(() => validateGuidance(recovery, {
			causalLinks: [{ ...causal, evidence: [{ step: 8, event: 500 }] }],
		})).toThrow(/missing authored event/);
		expect(() => validateGuidance(recovery, {
			causalLinks: [{ ...causal, step: 6 }],
		})).toThrow(/future frame/);
		expect(() => validateGuidance(recovery, {
			causalLinks: [{ ...causal, evidence: [{ step: 6, event: 0 }] }],
		})).toThrow(/state-changing event/);
		expect(() => validateGuidance(recovery, {
			causalLinks: [causal, causal],
		})).toThrow(/Duplicate causal-link ID/);
	});

	it("keeps each alternative deterministic, independent and truthful", () => {
		const [success, failure, retry] = CHECKOUT_SCENARIOS.map((scenario) => compile(scenario.source));
		expect(success.version).toBe(1);
		expect(failure.version).toBe(1);
		expect(retry.version).toBe(1);
		expect(success.frames.length).toBe(failure.frames.length);
		const read = (trace: typeof success, id: string) =>
			trace.frames.at(-1)?.state.entities.find((entity) => entity.id === id)?.value;
		expect(read(success, "ledger")).toBe("paid");
		expect(read(success, "customer")).toBe("confirmed");
		expect(read(failure, "ledger")).toBe("failed");
		expect(read(failure, "customer")).toBe("failed");
		expect(read(retry, "receipt")).toBe("paid: pay-ord-1042");
		for (const [i, scenario] of CHECKOUT_SCENARIOS.entries()) {
			const current = [success, failure, retry][i]!;
			expect(compile(scenario.source)).toEqual(current);
			const before = structuredClone(current.frames);
			for (const frame of [...current.frames].reverse()) {
				expect(current.frames[frame.index]).toEqual(before[frame.index]);
			}
			expect(current.frames).toEqual(before);
		}
	});
});
