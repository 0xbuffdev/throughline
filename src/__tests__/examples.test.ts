import { describe, expect, it } from "vitest";
import { compile } from "../domains/registry.js";
import { EXAMPLES } from "../examples.js";
import type { Frame, Trace } from "../model.js";
import { initialSeek, seekReducer } from "../seek.js";

const reference = (id: (typeof EXAMPLES)[number]["id"]) => {
	const example = EXAMPLES.find((candidate) => candidate.id === id);
	if (!example) throw new Error(`Missing reference example: ${id}`);
	return compile(example.source);
};

const at = (trace: Trace, label: string): Frame => {
	const frame = trace.frames.find((candidate) => candidate.label === label);
	if (!frame) throw new Error(`Missing reference step: ${label}`);
	return frame;
};

const value = (frame: Frame, id: string) =>
	frame.state.entities.find((entity) => entity.id === id)?.value;

describe("reference explanations", () => {
	it.each(EXAMPLES)("compiles $title as an inspectable trace", ({ source }) => {
		const { frames } = compile(source);
		expect(frames.length).toBeGreaterThan(2);
		expect(frames.slice(1).every((frame) => frame.state.notes.length > 0)).toBe(
			true,
		);
	});

	it.each(["reconciliation", "distributed-checkout"] as const)(
		"compiles %s deterministically and seeks without changing snapshots",
		(id) => {
			const example = EXAMPLES.find((candidate) => candidate.id === id)!;
			const trace = reference(id);
			const snapshots = structuredClone(trace.frames);
			expect(compile(example.source)).toEqual(trace);
			expect(trace.version).toBe(1);
			const max = trace.frames.length - 1;
			for (const index of [max, 1, Math.floor(max / 2), 0, max - 1, max]) {
				const seek = seekReducer(initialSeek(max), { type: "step", to: index });
				expect(trace.frames[seek.step]).toEqual(snapshots[index]);
			}
			expect(trace.frames).toEqual(snapshots);
		},
	);

	it.each(["reconciliation", "distributed-checkout"] as const)(
		"never invents transfer endpoints in %s",
		(id) => {
			const { frames } = reference(id);
			for (const frame of frames) {
				for (const transfer of frame.state.transfers) {
					const edge = frame.state.relations.find(
						(relation) => relation.id === transfer.relation,
					);
					expect(edge).toBeDefined();
					expect(edge?.hidden).not.toBe(true);
					expect(
						frame.state.entities.find((entity) => entity.id === edge?.from)
							?.hidden,
					).not.toBe(true);
					expect(
						frame.state.entities.find((entity) => entity.id === edge?.to)
							?.hidden,
					).not.toBe(true);
				}
			}
		},
	);

	it("plans keyed changes before committing them", () => {
		const trace = reference("reconciliation");
		const initial = trace.frames[0]!;
		const ready = at(trace, "Ready to commit");
		const committed = at(trace, "Commit the planned tree");

		expect(value(ready, "changes")).toEqual(["remove b", "insert c"]);
		expect(ready.state.entities.find((entity) => entity.id === "b")?.hidden)
			.not.toBe(true);
		expect(
			ready.state.entities.find((entity) => entity.id === "committedC")
				?.hidden,
		).toBe(true);
		expect(committed.state.entities.find((entity) => entity.id === "b")?.hidden)
			.toBe(true);
		expect(
			committed.state.entities.find((entity) => entity.id === "committedC")
				?.hidden,
		).toBe(false);
		expect(value(committed, "a")).toEqual(value(initial, "a"));
		expect(value(committed, "changes")).toEqual([
			"remove b",
			"insert c",
			"committed",
		]);
		expect(committed.state.transfers).toEqual([]);
	});

	it("distinguishes checkout messages, unknown outcomes and persisted recovery", () => {
		const trace = reference("distributed-checkout");
		const sent = at(trace, "Send first charge request");
		const timedOut = at(trace, "Timeout without confirmation");
		const retried = at(trace, "Resend same charge key");
		const deduplicated = at(trace, "Provider deduplicates retry");
		const acknowledged = at(trace, "Receive confirmed result");
		const recorded = at(trace, "Persist payment confirmation");
		const completed = at(trace, "Notify customer of recovery");

		expect(sent.state.transfers).toEqual([
			{ relation: "charge", value: { order: "ord-1042", key: "pay-ord-1042" } },
		]);
		expect(value(sent, "provider")).toBe("no charge");
		expect(value(timedOut, "receipt")).toBe("unconfirmed");
		expect(value(timedOut, "order")).toEqual({
			id: "ord-1042",
			status: "awaiting_payment",
		});
		expect(value(timedOut, "worker")).toContain("outcome unknown");
		expect(retried.state.transfers).toEqual(sent.state.transfers);
		expect(value(retried, "provider")).toBe(
			"one charge recorded: pay-ord-1042; reply lost",
		);
		expect(value(deduplicated, "provider")).toContain("retry deduplicated");
		expect(acknowledged.state.transfers).toEqual([
			{ relation: "acknowledge", value: { status: "paid", key: "pay-ord-1042" } },
		]);
		expect(value(recorded, "receipt")).toBe("paid: pay-ord-1042");
		expect(value(completed, "order")).toEqual({
			id: "ord-1042",
			status: "paid",
		});
		expect(value(completed, "status")).toBe("confirmed");
	});
});
