import { expect, it } from "vitest";
import { compile } from "../../domains/registry.js";
import { CHECKOUT_GUIDANCE, EXAMPLES } from "../../examples.js";
import { narrationText } from "../narration-text.js";

it("speaks only authored current-frame notes, chapters, evidence and explicit transfers", () => {
	const trace = compile(EXAMPLES.find((item) => item.id === "distributed-checkout")!.source);
	const frame = trace.frames.find((item) => item.label === "Receive confirmed result")!;
	const text = narrationText(frame, trace, CHECKOUT_GUIDANCE);
	expect(text).toContain("Receive confirmed result");
	expect(text).toContain("provider to worker");
	expect(text).not.toContain("Unwritten response");
	expect(narrationText(trace.frames[0], trace)).toBe(trace.frames[0].label);
});

it("bounds browser utterance input without changing the compiled authored trace", () => {
	const trace = compile('thl flow\nnode a "Author" = 0\nstep "A very long note"\n  note "' + "A".repeat(4000) + '"');
	const before = structuredClone(trace);
	const speech = narrationText(trace.frames[1], trace);
	expect(speech.length).toBeLessThanOrEqual(3000);
	expect(speech).toContain("A very long note");
	expect(speech.endsWith("...")).toBe(true);
	expect(trace).toEqual(before);
});
