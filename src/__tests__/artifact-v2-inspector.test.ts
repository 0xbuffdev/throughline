import { createHash } from "node:crypto";
import { cpus } from "node:os";
import { describe, expect, it } from "vitest";
import {
	ArtifactCompilationError,
	ArtifactValidationError,
	ARTIFACT_LIMITS,
	compileArtifact,
	inspectTrace,
	serializeArtifact,
	TraceQueryError,
	type Cell,
	type SemanticEvent,
	type VisualArtifact,
} from "../index.js";

function authored(): VisualArtifact {
	return {
		schemaVersion: 2,
		id: "distributedCheckout",
		origins: [
			{ id: "author", kind: "authored", description: "Example author" },
			{ id: "witness", kind: "observed", description: "Independent observation" },
			{ id: "agent", kind: "ai-proposed", description: "Proposed explanation only" },
		],
		entities: [
			{ id: "buyer", label: "Buyer" },
			{ id: "bank", label: "Bank" },
			{ id: "staging", label: "Future worker", initiallyPresent: false },
			{ id: "other", label: "Unrelated" },
		],
		relations: [
			{ id: "payment", from: "buyer", to: "bank" },
			{ id: "staged", from: "buyer", to: "staging", initiallyPresent: false },
		],
		initialState: {
			buyer: { status: "known", value: {
				balance: 100, meta: { flag: false }, matrix: [[1, 2], [3, 4]],
				nullable: null,
			} },
			bank: { status: "unknown", reason: "not inspected" },
			staging: { status: "known", value: { state: "planned" } },
			other: { status: "known", value: 8 },
		},
		steps: [
			{
				id: "dispatch",
				label: "Send payment request",
				events: [
					{ id: "debit", originId: "author", type: "write",
						entityId: "buyer", path: ["balance"],
						value: { status: "known", value: 90 } },
					{ id: "repeat", originId: "author", type: "write",
						entityId: "buyer", path: ["meta", "flag"],
						value: { status: "known", value: false } },
					{ id: "sent", originId: "author", type: "message",
						relationId: "payment", messageId: "charge",
						phase: "sent" },
					{ id: "observe", originId: "witness", type: "observation",
						entityId: "bank", value: { status: "known", value: "saw request" } },
					{ id: "activate", originId: "author", type: "topology",
						target: "entity", targetId: "staging", present: true },
					{ id: "connect", originId: "author", type: "topology",
						target: "relation", targetId: "staged", present: true },
				],
			},
			{
				id: "receipt",
				label: "Observe receipt; explicitly update model",
				time: { kind: "wall", iso8601: "2026-11-14T08:00:00Z" },
				events: [
					{ id: "received", originId: "witness", type: "message",
						relationId: "payment", messageId: "charge", phase: "received",
						dependsOn: ["sent"] },
					{ id: "matrix", originId: "author", type: "write",
						entityId: "buyer", path: ["matrix", 1, 0],
						value: { status: "known", value: 7 } },
					{ id: "disconnect", originId: "author", type: "topology",
						target: "relation", targetId: "staged", present: false },
					{ id: "bankKnown", originId: "author", type: "write",
						entityId: "bank", path: [], value: { status: "known", value: null } },
				],
			},
			{
				id: "later",
				label: "Unrelated observation and known-to-unknown change",
				time: { kind: "wall", iso8601: "2026-11-14T07:00:00Z" },
				events: [
					{ id: "isolated", originId: "witness", type: "message",
						relationId: "payment", messageId: "otherCharge",
						phase: "processed" },
					{ id: "hideBank", originId: "author", type: "write",
						entityId: "bank", path: [], value: { status: "unknown",
							reason: "no later sample" } },
				],
			},
		],
		claims: [
			{ id: "proposed", text: "Request caused settlement",
				kind: "causal", originId: "agent", review: "unreviewed",
				evidenceEventIds: ["sent", "received"] },
			{ id: "knownEvent", text: "A receipt was observed",
				kind: "explanation", originId: "witness", review: "reviewed",
				evidenceEventIds: ["received"] },
		],
	};
}

function fromJson<T>(input: T): T {
	return JSON.parse(JSON.stringify(input)) as T;
}

describe("TL-U04 — pure indexed semantic queries", () => {
	it("seeks independently and distinguishes known null, unknown and absent nested paths", () => {
		const query = inspectTrace(compileArtifact(authored()));
		expect(query.frameCount).toBe(4);
		expect(query.stateAt(0).values.bank).toEqual({
			status: "unknown", reason: "not inspected",
		});
		expect(query.valueAt(0, "bank", ["a", 0])).toEqual({
			status: "unknown", reason: "not inspected",
		});
		expect(query.valueAt(2, "bank")).toEqual({ status: "known", value: null });
		expect(query.valueAt(2, "bank", ["x"])).toEqual({ status: "absent" });
		expect(query.valueAt(0, "buyer", ["nullable"])).toEqual({
			status: "known", value: null,
		});
		expect(query.valueAt(1, "buyer", ["matrix", 1, 0])).toEqual({
			status: "known", value: 3,
		});
		expect(query.valueAt(2, "buyer", ["matrix", 1, 0])).toEqual({
			status: "known", value: 7,
		});
		expect(query.valueAt(2, "buyer", ["matrix", 200])).toEqual({ status: "absent" });
		expect(query.valueAt(2, "buyer", ["meta", "missing"])).toEqual({ status: "absent" });
		expect(query.valueAt(2, "buyer", ["matrix", "0"])).toEqual({ status: "absent" });
		expect(query.valueAt(2, "buyer", [0])).toEqual({ status: "absent" });
		expect(query.valueAt(3, "bank")).toEqual({
			status: "unknown", reason: "no later sample",
		});
		expect(query.valueAt(0, "staging", ["state"])).toEqual({
			status: "known", value: "planned",
		}); // a declared but absent entity still owns its cell
		expect(query.stateAt(0).presentEntityIds).not.toContain("staging");
		expect(query.stateAt(1).presentEntityIds).toContain("staging");
		expect(query.stateAt(2).presentRelationIds).not.toContain("staged");
		expect(query.stateAt(3).values.buyer).toEqual(query.stateAt(2).values.buyer);
		expect(query.stateAt(0).values.buyer).not.toEqual(query.stateAt(2).values.buyer);
	});

	it("reports explicit same-value writes and topology events, never message or observation as state change", () => {
		const query = inspectTrace(compileArtifact(authored()));
		const changes = query.diff(0, 1);
		expect(changes.map((item) => item.eventId)).toEqual([
			"debit", "repeat", "activate", "connect",
		]);
		expect(changes.map((item) => item.kind)).toEqual([
			"write", "write", "topology", "topology",
		]);
		expect(changes.map((item) => item.frameIndex)).toEqual([1, 1, 1, 1]);
		expect(changes.map((item) => item.stepId)).toEqual([
			"dispatch", "dispatch", "dispatch", "dispatch",
		]);
		expect(changes[1]).toMatchObject({
			kind: "write", direction: "forward",
			eventId: "repeat", originId: "author",
			path: ["meta", "flag"],
			before: { status: "known", value: false },
			after: { status: "known", value: false },
		});
		expect(changes[2]).toMatchObject({
			kind: "topology", target: "entity", targetId: "staging",
			beforePresent: false, afterPresent: true,
		});
		expect(query.diff(1, 2).map((item) => item.eventId)).toEqual([
			"matrix", "disconnect", "bankKnown",
		]);
		expect(query.diff(0, 2).map((item) => item.eventId)).toEqual([
			"debit", "repeat", "activate", "connect",
			"matrix", "disconnect", "bankKnown",
		]);
		expect(query.diff(0, 0)).toEqual([]);
		expect(query.diff(2, 2)).toEqual([]);
		expect(Object.isFrozen(changes)).toBe(true);
		expect(Object.isFrozen(changes[0])).toBe(true);
	});

	it("reverse diffs are labeled comparisons, never synthesized undo events", () => {
		const query = inspectTrace(compileArtifact(authored()));
		const backward = query.diff(2, 0);
		expect(backward.map((change) => change.eventId)).toEqual([
			"bankKnown", "disconnect", "matrix",
			"connect", "activate", "repeat", "debit",
		]);
		expect(backward.every((change) => change.direction === "backward")).toBe(true);
		expect(backward[0]).toMatchObject({
			kind: "write", before: { status: "known", value: null },
			after: { status: "unknown", reason: "not inspected" },
		});
		expect(backward[1]).toMatchObject({
			kind: "topology", beforePresent: false, afterPresent: true,
		});
		expect(query.diff(2, 1).map((change) => change.frameIndex)).toEqual([2, 2, 2]);
	});

	it("history intersects parent/child paths and excludes observation, message and topology events", () => {
		const query = inspectTrace(compileArtifact(authored()));
		expect(query.history("buyer").map((entry) => entry.eventId))
			.toEqual(["debit", "repeat", "matrix"]);
		expect(query.history("buyer", []).map((entry) => entry.eventId))
			.toEqual(["debit", "repeat", "matrix"]);
		expect(query.history("buyer", ["meta"]).map((entry) => entry.eventId))
			.toEqual(["repeat"]);
		expect(query.history("buyer", ["meta", "flag"]).map((entry) => entry.eventId))
			.toEqual(["repeat"]);
		expect(query.history("buyer", ["matrix"]).map((entry) => entry.eventId))
			.toEqual(["matrix"]);
		expect(query.history("buyer", ["matrix", 1]).map((entry) => entry.eventId))
			.toEqual(["matrix"]);
		expect(query.history("buyer", ["matrix", 0, 1])).toEqual([]);
		expect(query.history("buyer", ["nullable"])).toEqual([]);
		expect(query.history("bank").map((entry) => entry.eventId))
			.toEqual(["bankKnown", "hideBank"]);
		expect(query.history("other")).toEqual([]);
	});

	it("indexes endpoint-related events and authored transfers without fabricating delivery", () => {
		const query = inspectTrace(compileArtifact(authored()));
		expect(query.eventsFor("buyer").map((event) => event.id)).toEqual([
			"debit", "repeat", "sent", "connect", "received",
			"matrix", "disconnect", "isolated",
		]);
		expect(query.eventsFor("bank").map((event) => event.id)).toEqual([
			"sent", "observe", "received", "bankKnown", "isolated", "hideBank",
		]);
		expect(query.eventsFor("staging").map((event) => event.id)).toEqual([
			"activate", "connect", "disconnect",
		]);
		expect(query.eventsFor("other")).toEqual([]);
		expect(query.transfersFor("payment").map((event) => event.id))
			.toEqual(["sent", "received", "isolated"]);
		expect(query.transfersFor("staged")).toEqual([]);
		expect(query.relationsFor("buyer").map((relation) => relation.id))
			.toEqual(["payment", "staged"]);
		expect(query.relationsFor("other")).toEqual([]);
		expect(query.eventById("isolated")).toMatchObject({
			type: "message", phase: "processed", messageId: "otherCharge",
		}); // The model never invents preceding phases.
	});

	it("dependencies stay explicitly declared, without inferring order or verifying causal claims", () => {
		const query = inspectTrace(compileArtifact(authored()));
		expect(query.dependenciesOf("received").map((event) => event.id)).toEqual(["sent"]);
		expect(query.dependenciesOf("sent")).toEqual([]);
		expect(query.dependenciesOf("bankKnown")).toEqual([]);
		expect(query.causalEvidenceOf("received")).toEqual({
			status: "explicit",
			dependencies: [query.eventById("sent")],
			explanation: "Only these explicitly declared dependencies are modeled; other causes are not inferred or verified.",
		});
		expect(query.causalEvidenceOf("sent")).toEqual({
			status: "unmodeled",
			dependencies: [],
			explanation: "No explicit causal dependency is modeled for this event.",
		});
		expect(query.claimsForEvent("received").map((claim) => [
			claim.id, claim.review, claim.originId,
		])).toEqual([
			["proposed", "unreviewed", "agent"],
			["knownEvent", "reviewed", "witness"],
		]);
		expect(query.claimsForEvent("sent").map((claim) => claim.id))
			.toEqual(["proposed"]);
		expect(query.claimsForEvent("debit")).toEqual([]);
		expect(Object.isFrozen(query.dependenciesOf("received"))).toBe(true);
		expect(Object.isFrozen(query.causalEvidenceOf("sent"))).toBe(true);
		expect(Object.isFrozen(query.claimsForEvent("received"))).toBe(true);
	});

	it("rejects forged or deserialized compiled traces without recompilation", () => {
		const trace = compileArtifact(authored());
		expect(() => inspectTrace(fromJson(trace))).toThrow(
			/untrusted compiled trace; recompile from a validated artifact/,
		);
		expect(() => inspectTrace({ ...trace })).toThrow(ArtifactCompilationError);
		expect(() => inspectTrace({ schemaVersion: 2 } as never))
			.toThrow(ArtifactCompilationError);
		expect(() => inspectTrace(null as never)).toThrow(ArtifactCompilationError);
		expect(inspectTrace(trace).frameCount).toBe(4);
	});

	it("rejects invalid identifiers, query paths and frame positions with clear diagnostics", () => {
		const query = inspectTrace(compileArtifact(authored()));
		for (const frame of [-1, 4, 0.4, NaN, Number.POSITIVE_INFINITY])
			expect(() => query.stateAt(frame)).toThrow(TraceQueryError);
		expect(() => query.diff(0, 40)).toThrow(TraceQueryError);
		expect(() => query.diff(3, -1)).toThrow(TraceQueryError);
		expect(() => query.eventById("missing")).toThrow(TraceQueryError);
		expect(() => query.dependenciesOf("missing")).toThrow(TraceQueryError);
		expect(() => query.causalEvidenceOf("missing")).toThrow(TraceQueryError);
		expect(() => query.eventsFor("missing")).toThrow(TraceQueryError);
		expect(() => query.history("missing")).toThrow(TraceQueryError);
		expect(() => query.valueAt(0, "missing")).toThrow(TraceQueryError);
		expect(() => query.transfersFor("missing")).toThrow(TraceQueryError);
		expect(() => query.relationsFor("missing")).toThrow(TraceQueryError);
		expect(() => query.claimsForEvent("missing")).toThrow(TraceQueryError);
		for (const path of [
			["__proto__"], ["constructor"], ["prototype"], [-1], [1.25],
			[NaN], ["missing", Symbol("bad")], Array(33).fill(0),
			{} as never, "x" as never, null as never,
		]) {
			expect(() => query.valueAt(1, "buyer", path as never))
				.toThrow(ArtifactValidationError);
			expect(() => query.history("buyer", path as never))
				.toThrow(ArtifactValidationError);
		}
	});

	it("is detached, immutable, deterministic and safe for repeated random-access seeking", () => {
		const input = authored();
		const trace = compileArtifact(input);
		const query = inspectTrace(trace);
		const other = inspectTrace(compileArtifact(authored()));
		expect(query.stateAt(1)).toEqual(other.stateAt(1));
		expect(query.diff(0, 3)).toEqual(other.diff(0, 3));
		input.steps[0].events.length = 0;
		(input.initialState.buyer as { status: "known"; value: { balance: number } })
			.value.balance = 0;
		expect(query.stateAt(0).values.buyer).toEqual(other.stateAt(0).values.buyer);
		expect(query.diff(0, 3).map((change) => change.eventId)).toEqual(
			other.diff(0, 3).map((change) => change.eventId),
		);
		for (const i of [3, 0, 2, 1, 2, 3, 1, 0, 3])
			expect(query.stateAt(i)).toEqual(other.stateAt(i));
		expect(Object.isFrozen(query)).toBe(true);
		expect(Object.isFrozen(query.stateAt(0))).toBe(true);
		expect(Object.isFrozen(query.valueAt(1, "buyer", ["matrix"]))).toBe(true);
		expect(Object.isFrozen(query.eventsFor("buyer"))).toBe(true);
		expect(Object.isFrozen(query.history("buyer"))).toBe(true);
		expect(() => {
			(query.history("buyer") as object[]).push({ fake: true });
		}).toThrow(TypeError);
		expect(() => {
			(query.stateAt(0).values as Record<string, Cell>).buyer =
				{ status: "known", value: 0 };
		}).toThrow(TypeError);
		expect(query.valueAt(1, "buyer", ["balance"])).toEqual({
			status: "known", value: 90,
		});
	});
});

describe("TL-U04 — bounded index and large-trace query measurement", () => {
	it("indexes 10,000 explicit writes across 2,000 steps; repeated indexed lookups stay correct", () => {
		const steps = ARTIFACT_LIMITS.steps;
		const eventsPerStep = ARTIFACT_LIMITS.events / steps; // 5 disjoint writes
		const source: VisualArtifact = {
			schemaVersion: 2,
			id: "indexBound",
			origins: [{ id: "authored", kind: "authored" }],
			entities: [{ id: "node", label: "Node" }],
			relations: [],
			initialState: { node: { status: "known", value: {
				a: 0, b: 0, c: 0, d: 0, e: 0,
			} } },
			steps: Array.from({ length: steps }, (_, n) => ({
				id: "step" + n, label: "Step " + n,
				events: Array.from({ length: eventsPerStep }, (_, j) => ({
					id: "w" + n + "_" + j,
					originId: "authored",
					type: "write" as const,
					entityId: "node",
					path: [["a", "b", "c", "d", "e"][j]],
					value: { status: "known" as const, value: n + 1 },
				})),
			})),
		};
		const fixtureSHA256 = createHash("sha256")
			.update(serializeArtifact(source)).digest("hex");
		const start = performance.now();
		const query = inspectTrace(compileArtifact(source));
		const indexedMs = performance.now() - start;
		const lookupStart = performance.now();
		for (let i = 0; i < 10_000; i++) {
			const n = i % steps;
			expect(query.eventById("w" + n + "_0").id).toBe("w" + n + "_0");
			expect(query.stateAt(n + 1).values.node.status).toBe("known");
		}
		const lookupMs = performance.now() - lookupStart;
		expect(query.frameCount).toBe(2001);
		expect(query.diff(0, steps)).toHaveLength(10_000);
		expect(query.history("node")).toHaveLength(10_000);
		expect(query.history("node", ["c"])).toHaveLength(steps);
		expect(query.valueAt(0, "node", ["a"])).toEqual({ status: "known", value: 0 });
		expect(query.valueAt(steps, "node", ["a"]))
			.toEqual({ status: "known", value: steps });
		console.info("TL-U04 query boundary benchmark:", JSON.stringify({
			fixtureSHA256,
			steps,
			events: steps * eventsPerStep,
			node: process.version,
			platform: process.platform,
			cpu: cpus()[0]?.model ?? "unknown",
			compileAndIndexMs: Number(indexedMs.toFixed(1)),
			tenThousandLookupsMs: Number(lookupMs.toFixed(1)),
		}));
	}, 60_000);
});
