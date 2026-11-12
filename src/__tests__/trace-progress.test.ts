import { describe, expect, it } from "vitest";
import { compile } from "../domains/registry.js";
import { CHECKOUT_SCENARIOS, EXAMPLES } from "../examples.js";
import { traceProgress } from "../scene/progress.js";

const checkout = compile(EXAMPLES.find((example) => example.id === "distributed-checkout")!.source);
const step = (label: string) => {
	const index = checkout.frames.findIndex((frame) => frame.label === label);
	expect(index).toBeGreaterThan(0);
	return index;
};

describe("cumulative authored workflow trail", () => {
	it("retains sends and participating nodes without inferring replies or writes", () => {
		const original = structuredClone(checkout);
		const beginning = traceProgress(checkout, 0);
		expect([...beginning.traversedRelations]).toEqual([]);
		expect([...beginning.participatingNodes]).toEqual([]);

		const charge = traceProgress(checkout, step("Send first charge request"));
		expect([...charge.traversedRelations]).toEqual([
			"request", "create", "enqueue", "outcome", "dequeue", "charge",
		]);
		expect(charge.participatingNodes.has("provider")).toBe(true);
		expect(charge.participatingNodes.has("receipt")).toBe(false);
		expect(charge.traversedRelations.has("acknowledge")).toBe(false);

		// Provider-local persistence does not manufacture a reply edge.
		const provider = traceProgress(checkout, step("Provider records charge"));
		expect(provider.traversedRelations.has("acknowledge")).toBe(false);
		expect(provider.participatingNodes.has("provider")).toBe(true);

		const received = traceProgress(checkout, step("Receive confirmed result"));
		expect(received.traversedRelations.has("acknowledge")).toBe(true);
		expect(received.traversedRelations.has("charge")).toBe(true);
		expect(received.participatingNodes.has("receipt")).toBe(false);

		const persisted = traceProgress(checkout, step("Persist payment confirmation"));
		expect(persisted.traversedRelations.has("confirm")).toBe(true);
		expect(persisted.participatingNodes.has("receipt")).toBe(true);

		const final = traceProgress(checkout, checkout.frames.length - 1);
		expect(final.traversedRelations).toEqual(new Set(checkout.frames[0].state.relations.map((relation) => relation.id)));
		expect(final.participatingNodes).toEqual(new Set(checkout.frames[0].state.entities.map((node) => node.id)));

		// Seeking is derived from the target frame, never sticky state.
		expect(traceProgress(checkout, 0)).toEqual(beginning);
		expect(traceProgress(checkout, step("Send first charge request"))).toEqual(charge);
		expect(traceProgress(checkout, 99_999)).toEqual(final);
		expect(checkout).toEqual(original);
	});

	it("distinguishes explicitly revealed relations from transferred relations", () => {
		const trace = compile(EXAMPLES.find((example) => example.id === "reconciliation")!.source);
		const reuse = trace.frames.findIndex((frame) => frame.label === "Reuse key a");
		expect(reuse).toBeGreaterThan(0);
		const progress = traceProgress(trace, reuse);
		expect(progress.revealedRelations.has("matchA")).toBe(true);
		expect(progress.traversedRelations.has("matchA")).toBe(false);
		expect(progress.participatingNodes.has("reuse")).toBe(true);
		const last = traceProgress(trace, trace.frames.length - 1);
		expect(last.revealedRelations.has("matchA")).toBe(true);
		expect(last.traversedRelations.size).toBe(0);
		expect(traceProgress(trace, 0).revealedRelations.has("matchA")).toBe(false);
	});

	it("does not carry progress into another independent scenario", () => {
		const success = compile(CHECKOUT_SCENARIOS[0].source);
		const failed = compile(CHECKOUT_SCENARIOS[1].source);
		expect(traceProgress(success, success.frames.length - 1).traversedRelations.size).toBeGreaterThan(0);
		expect(traceProgress(failed, 0).traversedRelations.size).toBe(0);
		expect(traceProgress(failed, 0).participatingNodes.size).toBe(0);
	});

	it("keeps empty traces empty", () => {
		expect(traceProgress({ version: 1, frames: [] }, 0)).toEqual({
			participatingNodes: new Set(),
			traversedRelations: new Set(),
			revealedRelations: new Set(),
		});
	});
});
