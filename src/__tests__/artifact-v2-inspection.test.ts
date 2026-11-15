import { createHash } from "node:crypto";
import { cpus } from "node:os";
import { describe, expect, it } from "vitest";
import {
	ArtifactValidationError, compileArtifact, inspectTrace, projectInspection,
	serializeArtifact, TraceQueryError, type VisualArtifact,
} from "../index.js";
import { distributedGraph } from "./v2-graph-fixture.js";
import { retryCheckout } from "./v2-sequence-fixture.js";
import { claimHeavyInspection } from "./v2-claims-fixture.js";

function example(): VisualArtifact {
	const source = distributedGraph();
	source.claims = [{
		id: "futureCausalTheory",
		text: "Request caused all later worker changes",
		kind: "causal", originId: "author",
		evidenceEventIds: ["sent", "workerOff"], review: "reviewed",
	}, {
		id: "unsupportedInterpretation",
		text: "Processing proves settlement",
		kind: "causal", originId: "author",
		evidenceEventIds: ["processed"], review: "unreviewed",
	}];
	source.steps.push({
		id: "sameValue", label: "Write settled to the already settled value",
		events: [{
			id: "repeatSettled", type: "write", originId: "author",
			entityId: "ledger", path: ["settled"],
			value: { status: "known", value: true },
		}],
	});
	source.steps.push({
		id: "parentWrite", label: "Replace an entire parent object",
		events: [{
			id: "replaceClient", type: "write", originId: "author",
			entityId: "client", path: [],
			value: { status: "known", value: { paid: true } },
		}],
	});
	return source;
}
const open = (source = example()) => inspectTrace(compileArtifact(source));

describe("TL-U07 — pure Explain/Inspect projection", () => {
	it("keeps initial chapter and missing evidence explicit", () => {
		const query = open();
		const view = projectInspection(query, { frameIndex: 0 });
		expect(view.chapter).toEqual({
			frameIndex: 0, frameId: "@initial", label: "Initial state",
		});
		expect(view.fromFrameId).toBe("@initial");
		expect(view.compareFromIndex).toBe(0);
		expect(view.changes).toEqual([]);
		expect(view.stepEvidence).toEqual([]);
		expect(view.focused).toBeUndefined();
		expect(view.evidenceLimits).toContain("Missing evidence remains unmodeled");
		expect(view.state.map(row => row.entityId))
			.toEqual(["client", "gateway", "ledger", "worker"]);
		expect(view.state.find(row => row.entityId === "worker")).toMatchObject({
			presentAfter: false,
			after: { status: "known", value: { task: "queued" } },
		});
		expect(Object.isFrozen(view)).toBe(true);
		expect(Object.isFrozen(view.state)).toBe(true);
		expect(Object.isFrozen(view.state[0])).toBe(true);
	});

	it("distinguishes modeled writes, same-value writes and topology from message-only steps", () => {
		const query = open();
		expect(projectInspection(query, { frameIndex: 1 }).changes).toEqual([]);
		expect(projectInspection(query, { frameIndex: 2 }).changes).toEqual([]);
		const commit = projectInspection(query, { frameIndex: 3 });
		expect(commit.changes.map(change => change.eventId)).toEqual(["settled"]);
		expect(commit.changes[0]).toMatchObject({
			kind: "write", frameIndex: 3, frameId: "commit",
			before: { status: "known", value: false },
			after: { status: "known", value: true },
		});
		expect(commit.stepEvidence.map(evidence => evidence.eventId))
			.toEqual(["settled", "processed"]);
		expect(commit.state.find(row => row.entityId === "ledger")).toMatchObject({
			before: { status: "known", value: { settled: false, amount: null } },
			after: { status: "known", value: { settled: true, amount: null } },
		});
		expect(projectInspection(query, { frameIndex: 4 }).changes.map(change => change.eventId))
			.toEqual(["workerOn", "taskOn"]);
		const removed = projectInspection(query, { frameIndex: 6 });
		expect(removed.changes.map(change => change.eventId)).toEqual(["taskOff", "workerOff"]);
		expect(removed.changes.map(change => change.kind)).toEqual(["presence", "presence"]);
		expect(removed.state.find(row => row.entityId === "worker")).toMatchObject({
			presentBefore: true, presentAfter: false,
		});
		const same = projectInspection(query, { frameIndex: 7 });
		expect(same.changes).toHaveLength(1);
		expect(same.changes[0]).toMatchObject({
			kind: "write", eventId: "repeatSettled",
			before: { status: "known", value: true },
			after: { status: "known", value: true },
		});
		const compare = projectInspection(query, { frameIndex: 7, compareFromIndex: 0 });
		expect(compare.changes.map(change => change.eventId))
			.toEqual(["settled", "workerOn", "taskOn", "taskOff", "workerOff",
				"repeatSettled"]);
		// This is an event-aware log, not just comparing net final objects.
		expect(query.stateAt(0).presentEntityIds.includes("worker")).toBe(false);
		expect(query.stateAt(7).presentEntityIds.includes("worker")).toBe(false);
	});

	it("queries requested nested paths across parent writes and preserves absent/unknown/null", () => {
		const query = open();
		const paid = projectInspection(query, {
			frameIndex: 8, entityId: "client", path: ["paid"],
		}).selected!;
		expect(paid).toMatchObject({
			entityId: "client", path: ["paid"], presentAfter: true,
			before: { status: "known", value: false },
			after: { status: "known", value: true },
		});
		expect(paid.history).toHaveLength(1);
		expect(paid.history[0]).toMatchObject({
			eventId: "replaceClient",
			path: [], // authored parent path, NOT the requested query path
			before: { status: "known", value: false },
			after: { status: "known", value: true },
		});
		const amount = projectInspection(query, {
			frameIndex: 8, entityId: "client", path: ["amount"],
		}).selected!;
		expect(amount.after).toEqual({ status: "absent" });
		expect(amount.before).toEqual({ status: "known", value: 25 });
		expect(amount.history[0]).toMatchObject({
			eventId: "replaceClient", path: [],
			before: { status: "known", value: 25 },
			after: { status: "absent" },
		});
		const unknown = projectInspection(query, {
			frameIndex: 1, entityId: "gateway", path: ["anything"],
		}).selected!;
		expect(unknown.before).toEqual({ status: "unknown", reason: "not measured" });
		expect(unknown.after).toEqual({ status: "unknown", reason: "not measured" });
		expect(unknown.history).toEqual([]);
		const nil = projectInspection(query, {
			frameIndex: 3, entityId: "ledger", path: ["amount"],
		}).selected!;
		expect(nil.after).toEqual({ status: "known", value: null });
		expect(nil.history).toEqual([]);
	});

	it("uses declared relation phases without equating sent with receipt or persistence", () => {
		const query = open();
		const empty = projectInspection(query, { frameIndex: 0, relationId: "request" });
		expect(empty.relation?.transfers).toEqual([]);
		const sent = projectInspection(query, { frameIndex: 1, relationId: "request" });
		expect(sent.relation?.transfers.map(evidence => evidence.eventId)).toEqual(["sent"]);
		expect(sent.relation?.transfers[0]).toMatchObject({
			frameIndex: 1, source: {
				eventIds: ["sent"],
				relationIds: ["request"],
				entityIds: ["client", "gateway"],
			},
			origin: { kind: "authored" },
		});
		expect(sent.relation?.explanation).toContain(
			"A sent event alone cannot establish receipt");
		expect(query.valueAt(1, "gateway")).toMatchObject({ status: "unknown" });
		const recv = projectInspection(query, { frameIndex: 2, relationId: "request" });
		expect(recv.relation?.transfers.map(row => row.event.type === "message"
			? row.event.phase : null)).toEqual(["sent", "received"]);
		const processed = projectInspection(query, {
			frameIndex: 3, relationId: "settlement",
		});
		expect(processed.relation?.transfers.map(row => row.event.type === "message"
			? row.event.phase : null)).toEqual(["processed"]);
		expect(processed.relation?.transfers.some(row =>
			row.event.type === "message" && row.event.phase === "sent")).toBe(false);
	});

	it("separates explicit dependencies from editorial causal claims and future evidence", () => {
		const query = open();
		const received = projectInspection(query, { frameIndex: 2, eventId: "received" });
		expect(received.focused?.causality).toBe("explicit");
		expect(received.focused?.dependencies.map(row => row.eventId)).toEqual(["sent"]);
		expect(received.focused?.explanation)
			.toContain("Only these explicitly declared dependencies");
		expect(received.focused?.evidence.origin.kind).toBe("observed");

		const sent = projectInspection(query, { frameIndex: 1, eventId: "sent" });
		expect(sent.focused?.causality).toBe("unmodeled");
		expect(sent.focused?.dependencies).toEqual([]);
		expect(sent.focused?.explanation).toContain("No explicit causal dependency");
		expect(sent.focused?.claims).toHaveLength(1);
		expect(sent.focused?.claims[0]).toMatchObject({
			claim: { review: "reviewed", kind: "causal" },
			unmodeledUntilLater: 1,
			modeledEvidence: [{ eventId: "sent" }],
		});
		expect(sent.focused?.claims[0].explanation).toContain(
			"Editorial review is not scientific proof");
		expect(sent.focused?.claims[0].explanation).toContain(
			"incomplete modeled evidence");
		expect(sent.focused?.claims[0].modeledEvidence.some(row =>
			row.eventId === "workerOff")).toBe(false);
		const later = projectInspection(query, { frameIndex: 6, eventId: "sent" });
		expect(later.focused?.claims[0].unmodeledUntilLater).toBe(0);
		expect(later.focused?.claims[0].modeledEvidence.map(row => row.eventId))
			.toEqual(["sent", "workerOff"]);
		expect(later.focused?.claims[0].explanation).toContain(
			"does not independently verify this claim");
		const proposed = projectInspection(query, { frameIndex: 3, eventId: "processed" });
		expect(proposed.focused?.claims[0]).toMatchObject({
			claim: { review: "unreviewed" },
			unmodeledUntilLater: 0,
		});
		expect(proposed.focused?.causality).toBe("unmodeled");
		expect(proposed.focused?.dependencies).toEqual([]);
	});

	it("rejects untrusted inspectors, future event inspection, invalid path and reverse comparisons", () => {
		const query = open();
		expect(() => projectInspection({ ...query }, { frameIndex: 1 }))
			.toThrow(TraceQueryError);
		expect(() => projectInspection(query, { frameIndex: 99 })).toThrow(TraceQueryError);
		expect(() => projectInspection(query, { frameIndex: 2, compareFromIndex: 3 }))
			.toThrow(TraceQueryError);
		expect(() => projectInspection(query, { frameIndex: 1, eventId: "workerOff" }))
			.toThrow(TraceQueryError);
		try {
			projectInspection(query, { frameIndex: 1, eventId: "workerOff" });
		} catch (error) {
			expect((error as TraceQueryError).path).toBe("$.eventId");
		}
		expect(() => projectInspection(query, { frameIndex: 1, entityId: "bad" }))
			.toThrow(TraceQueryError);
		expect(() => projectInspection(query, { frameIndex: 1, path: ["x"] }))
			.toThrow(TraceQueryError);
		// The underlying validator owns path safety, so reserved property
		// names intentionally raise ArtifactValidationError, not query errors.
		expect(() => projectInspection(query, {
			frameIndex: 1, entityId: "client", path: ["__proto__"],
		})).toThrow(ArtifactValidationError);
		expect(() => projectInspection(query, { frameIndex: 1, relationId: "bad" }))
			.toThrow(TraceQueryError);
	});

	it("remains detached, immutable, deterministic and bounded across random seeking", () => {
		const source = example();
		const query = open(source);
		const first = projectInspection(query, {
			frameIndex: 6, compareFromIndex: 0,
			entityId: "ledger", path: ["settled"], relationId: "request",
			eventId: "sent",
		});
		expect(projectInspection(query, {
			frameIndex: 6, compareFromIndex: 0,
			entityId: "ledger", path: ["settled"], relationId: "request",
			eventId: "sent",
		})).toEqual(first);
		expect(Object.isFrozen(first.changes)).toBe(true);
		expect(Object.isFrozen(first.selected?.history)).toBe(true);
		expect(Object.isFrozen(first.relation?.transfers)).toBe(true);
		expect(Object.isFrozen(first.focused?.claims)).toBe(true);
		source.steps.splice(0);
		source.entities[0].label = "Mutated after validation";
		expect(projectInspection(query, {
			frameIndex: 6, compareFromIndex: 0,
			entityId: "ledger", path: ["settled"], relationId: "request",
			eventId: "sent",
		})).toEqual(first);
		for (const frameIndex of [1, 8, 3, 5, 0, 7, 2]) {
			const model = projectInspection(query, { frameIndex });
			expect(model.chapter.frameIndex).toBe(frameIndex);
			expect(model.changes.every(change => change.frameIndex <= frameIndex)).toBe(true);
		}
		expect(() => (first.state as unknown[]).push("fake")).toThrow(TypeError);
	});

	it("exposes exact authored observation cells and optional message payload without persistence", () => {
		const source = retryCheckout();
		const sent = source.steps[0]!.events[0]!;
		if (sent.type !== "message") throw new Error("invalid example fixture");
		sent.payload = { requestedAmount: 25, status: null, note: "A".repeat(180) + "z" };
		const query = open(source);
		const sentView = projectInspection(query, { frameIndex: 1, eventId: "originalSent" });
		expect(sentView.focused?.evidence.recorded).toMatchObject({
			kind: "message-payload",
			value: { requestedAmount: 25, status: null, note: "A".repeat(180) + "z" },
		});
		expect(sentView.stepEvidence[0].recorded).toBe(sentView.focused?.evidence.recorded);
		expect(Object.isFrozen(sentView.focused?.evidence.recorded)).toBe(true);
		expect(Object.isFrozen((sentView.focused?.evidence.recorded as
			{ value: object }).value)).toBe(true);
		expect(query.valueAt(1, "gateway")).toEqual({
			status: "unknown", reason: "no state measurement",
		});
		expect(query.valueAt(1, "client", ["timeout"]))
			.toEqual({ status: "known", value: false });

		const observed = projectInspection(query, {
			frameIndex: 3, entityId: "client", eventId: "watchTimeout",
		});
		expect(observed.focused?.evidence.recorded).toEqual({
			kind: "observation",
			value: { status: "known", value: "no acknowledgement recorded yet" },
		});
		expect(observed.focused?.evidence.origin.kind).toBe("observed");
		expect(observed.changes).toEqual([]);
		expect(observed.selected?.after).toEqual({
			status: "known", value: { timeout: false, ack: false },
		});
		// Data-only evidence, not a hidden write, invented acknowledgement or
		// receiver persistence. Null message payloads are still present values.
		const second = retryCheckout();
		const firstEvent = second.steps[0]!.events[0]!;
		if (firstEvent.type !== "message") throw new Error("invalid example fixture");
		firstEvent.payload = null;
		const nullView = projectInspection(open(second), {
			frameIndex: 1, eventId: "originalSent",
		});
		expect(nullView.focused?.evidence.recorded)
			.toEqual({ kind: "message-payload", value: null });
		expect(projectInspection(query, {
			frameIndex: 2, eventId: "originalReceived",
		}).focused?.evidence.recorded).toBeUndefined();
		source.steps[0]!.label = "mutated original";
		expect(projectInspection(query, { frameIndex: 1, eventId: "originalSent" })
			.focused?.evidence.recorded).toEqual(sentView.focused?.evidence.recorded);
	});

	it("deduplicates repeated claim evidence descriptors across 1,000 claims × 100 references", () => {
		const source = claimHeavyInspection();
		const hash = createHash("sha256").update(serializeArtifact(source)).digest("hex");
		const query = open(source);
		const start = performance.now();
		const view = projectInspection(query, { frameIndex: 100, eventId: "observation99" });
		const ms = Number((performance.now() - start).toFixed(1));
		expect(view.focused?.claims).toHaveLength(1000);
		expect(view.focused?.claims[0].modeledEvidence).toHaveLength(100);
		expect(view.focused?.claims[999].modeledEvidence).toHaveLength(100);
		expect(view.focused?.claims[0].modeledEvidence[50])
			.toBe(view.focused?.claims[999].modeledEvidence[50]);
		expect(view.focused?.evidence.recorded).toEqual({
			kind: "observation",
			value: { status: "known", value: "recorded 99" },
		});
		expect(view.state[0].after).toEqual({
			status: "unknown", reason: "no state write",
		});
		expect(Object.isFrozen(view.focused?.claims[0].modeledEvidence)).toBe(true);
		const halfway = projectInspection(query, {
			frameIndex: 50, eventId: "observation49",
		});
		expect(halfway.focused?.claims).toHaveLength(1000);
		expect(halfway.focused?.claims[500].modeledEvidence).toHaveLength(50);
		expect(halfway.focused?.claims[500].unmodeledUntilLater).toBe(50);
		expect(halfway.focused?.claims[500].modeledEvidence.every(e =>
			e.frameIndex <= 50)).toBe(true);
		console.info("TL-U07 claims-heavy evidence boundary:", JSON.stringify({
			fixtureSHA256: hash, claims: 1000, citationsPerClaim: 100, events: 100,
			cpu: cpus()[0]?.model ?? "unknown", platform: process.platform,
			runtime: process.version, fullClaimProjectionMs: ms,
		}));
	}, 60_000);

	it("benchmarks selected-frame inspection over a near-limit 10k-event 1k-link model", () => {
		const source: VisualArtifact = {
			schemaVersion: 2, id: "inspectionBoundary",
			origins: [{ id: "author", kind: "authored" }],
			entities: Array.from({ length: 200 }, (_, i) =>
				({ id: "actor" + i, label: "Actor " + i })),
			relations: Array.from({ length: 1000 }, (_, i) =>
				({ id: "rel" + i, from: "actor0", to: "actor1" })),
			initialState: Object.fromEntries(Array.from({ length: 200 }, (_, i) =>
				["actor" + i, { status: "unknown" as const, reason: "no measurement" }])),
			steps: Array.from({ length: 2000 }, (_, i) => ({
				id: "step" + i, label: "Step " + i,
				events: Array.from({ length: 5 }, (_, j) => {
					const ordinal = i * 5 + j;
					const relationId = "rel" + (ordinal % 1000);
					return {
						id: "event" + ordinal, originId: "author", type: "message" as const,
						relationId, messageId: "message" + (ordinal % 1000),
						phase: "sent" as const,
					};
				}),
			})),
		};
		const fixtureSHA256 = createHash("sha256")
			.update(serializeArtifact(source)).digest("hex");
		const query = open(source);
		const start = performance.now();
		for (const frameIndex of [0, 500, 1200, 2000, 1500, 2000]) {
			const view = projectInspection(query, {
				frameIndex, relationId: "rel999", entityId: "actor0",
			});
			expect(view.state).toHaveLength(200);
			expect(view.relation?.relation.id).toBe("rel999");
			expect(view.relation?.transfers.every(x => x.frameIndex <= frameIndex)).toBe(true);
			expect(view.stepEvidence.length).toBe(frameIndex ? 5 : 0);
		}
		console.info("TL-U07 inspection 10k-event boundary:", JSON.stringify({
			fixtureSHA256, steps: 2000, events: 10_000, relations: 1000,
			cpu: cpus()[0]?.model ?? "unknown",
			runtime: process.version, platform: process.platform,
			sixQueriesMs: Number((performance.now() - start).toFixed(1)),
		}));
	}, 60_000);
});
