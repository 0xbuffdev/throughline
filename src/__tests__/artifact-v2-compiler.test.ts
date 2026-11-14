import { createHash } from "node:crypto";
import { cpus } from "node:os";
import { describe, expect, it } from "vitest";
import {
	ArtifactCompilationError,
	ArtifactValidationError,
	ARTIFACT_LIMITS,
	compileArtifact,
	serializeArtifact,
	type Cell,
	type SemanticEvent,
	type VisualArtifact,
} from "../index.js";

const authored = (): VisualArtifact => ({
	schemaVersion: 2,
	id: "checkout",
	origins: [
		{ id: "author", kind: "authored" },
		{ id: "observer", kind: "observed" },
	],
	groups: [{ id: "network", label: "Network" }],
	entities: [
		{ id: "worker", label: "Worker", groupId: "network" },
		{ id: "provider", label: "Provider", groupId: "network" },
		{ id: "staging", label: "Preactivated", initiallyPresent: false },
	],
	relations: [
		{ id: "request", from: "worker", to: "provider" },
		{ id: "inactive", from: "worker", to: "staging", initiallyPresent: false },
	],
	initialState: {
		worker: { status: "known", value: {
			paid: false, attempts: 0, matrix: [[1, 2], [3, 4]], stack: [{ n: 3 }],
		} },
		provider: { status: "unknown", reason: "unobserved" },
		staging: { status: "known", value: { state: "planned" } },
	},
	steps: [
		{
			id: "requestStep",
			label: "Dispatch request",
			events: [
				{ id: "attempt", type: "write", originId: "author", entityId: "worker",
					path: ["attempts"], value: { status: "known", value: 1 } },
				{ id: "sent", type: "message", originId: "author", relationId: "request",
					messageId: "charge1", phase: "sent" },
			],
		},
		{
			id: "seen",
			label: "Observation without acknowledgement",
			time: { kind: "wall", iso8601: "2026-11-14T08:00:00Z" },
			events: [
				{ id: "received", type: "message", originId: "observer",
					relationId: "request", messageId: "charge1", phase: "received",
					dependsOn: ["sent"] },
				{ id: "observed", type: "observation", originId: "observer",
					entityId: "provider", value: { status: "known", value: "observed" } },
			],
		},
	],
	claims: [{ id: "claim", text: "The charge may have been processed",
		kind: "assumption", originId: "author", evidenceEventIds: [],
		review: "unreviewed" }],
});

function addStep(
	input: VisualArtifact,
	events: SemanticEvent[],
	id = "stepExtra",
): void {
	input.steps.push({ id, label: id, events });
}

function write(
	id: string, entityId: string, path: (string | number)[], value: Cell,
): SemanticEvent {
	return { id, type: "write", originId: "author", entityId, path, value };
}

function assertCompilerRejects(
	input: VisualArtifact, path: string, reason: RegExp,
): void {
	try {
		compileArtifact(input);
	} catch (error) {
		expect(error).toBeInstanceOf(ArtifactCompilationError);
		const rejection = error as ArtifactCompilationError;
		expect(rejection.path).toBe(path);
		expect(rejection.message).toMatch(reason);
		return;
	}
	throw new Error("Expected compile rejection at " + path);
}

describe("TL-U03 — deterministic semantic frames", () => {
	it("creates @initial and one immutable post-commit frame per step", () => {
		const trace = compileArtifact(authored());
		expect(trace.schemaVersion).toBe(2);
		expect(trace.frames.map((f) => [f.id, f.index, f.label, f.eventIds])).toEqual([
			["@initial", 0, "Initial state", []],
			["requestStep", 1, "Dispatch request", ["attempt", "sent"]],
			["seen", 2, "Observation without acknowledgement", ["received", "observed"]],
		]);
		expect(trace.frames[0].snapshot.presentEntityIds).toEqual(["worker", "provider"]);
		expect(trace.frames[0].snapshot.presentRelationIds).toEqual(["request"]);
		expect(trace.frames[1].snapshot.values.worker).toEqual({
			status: "known", value: {
				paid: false, attempts: 1, matrix: [[1, 2], [3, 4]], stack: [{ n: 3 }],
			},
		});
		expect(trace.frames[2].snapshot.values.provider).toEqual({
			status: "unknown", reason: "unobserved",
		});
		expect(trace.frames[0].snapshot.values.worker).toEqual({
			status: "known", value: {
				paid: false, attempts: 0, matrix: [[1, 2], [3, 4]], stack: [{ n: 3 }],
			},
		});
	});

	it("is deterministic independent of the caller's subsequent input mutation", () => {
		const input = authored();
		const one = compileArtifact(input);
		const two = compileArtifact(input);
		expect(one).toEqual(two);
		input.steps[0].events.length = 0;
		(input.initialState.worker as { status: "known"; value: { attempts: number } }).value.attempts = 91;
		expect(one.frames[1].eventIds).toEqual(["attempt", "sent"]);
		expect(one.frames[0].snapshot.values.worker).toEqual(two.frames[0].snapshot.values.worker);
		expect(Object.isFrozen(one)).toBe(true);
		expect(Object.isFrozen(one.frames)).toBe(true);
		expect(Object.isFrozen(one.frames[1].eventIds)).toBe(true);
		expect(Object.isFrozen(one.frames[1].snapshot.values)).toBe(true);
		expect(Object.isFrozen((one.frames[1].snapshot.values.worker as {
			status: "known"; value: object
		}).value)).toBe(true);
		expect(() => {
			(one.frames[1].snapshot.values as Record<string, Cell>).worker =
				{ status: "known", value: 900 };
		}).toThrow(TypeError);
	});

	it("rejects externally supplied compiled frames rather than trusting schemaVersion", () => {
		const trace = compileArtifact(authored());
		expect(() => compileArtifact(trace as unknown as VisualArtifact))
			.toThrow(ArtifactValidationError);
	});

	it("does not persist observations or fabricate message phases", () => {
		const trace = compileArtifact(authored());
		expect(trace.frames[2].snapshot.values.provider)
			.toEqual({ status: "unknown", reason: "unobserved" });
		expect(trace.frames[2].eventIds).toEqual(["received", "observed"]);
		expect(trace.frames[2].snapshot.values.worker)
			.toEqual(trace.frames[1].snapshot.values.worker);
	});

	it("supports isolated received messages and out-of-order observed timestamps", () => {
		const source = authored();
		source.steps = [
			{ id: "lateWall", label: "First observed", time: {
				kind: "wall", iso8601: "2026-11-14T12:00:00Z",
			}, events: [{ id: "isolated", type: "message", originId: "observer",
				relationId: "request", messageId: "unseen", phase: "received" }] },
			{ id: "earlyWall", label: "Second observed", time: {
				kind: "wall", iso8601: "2026-11-14T08:00:00Z",
			}, events: [{ id: "ack", type: "message", originId: "observer",
				relationId: "request", messageId: "unseen", phase: "acknowledged" }] },
		];
		const trace = compileArtifact(source);
		expect(trace.frames.map((f) => f.id)).toEqual(["@initial", "lateWall", "earlyWall"]);
		expect(trace.frames[2].eventIds).toEqual(["ack"]);
	});

	it("merges disjoint same-step nested matrix, stack and state writes atomically", () => {
		const source = authored();
		addStep(source, [
			write("matrixA", "worker", ["matrix", 0, 1], { status: "known", value: 7 }),
			write("matrixB", "worker", ["matrix", 1, 0], { status: "known", value: 8 }),
			write("stackN", "worker", ["stack", 0, "n"], { status: "known", value: 2 }),
			write("paid", "worker", ["paid"], { status: "known", value: true }),
		]);
		const trace = compileArtifact(source);
		expect(trace.frames[3].snapshot.values.worker).toEqual({
			status: "known",
			value: { paid: true, attempts: 1, matrix: [[1, 7], [8, 4]], stack: [{ n: 2 }] },
		});
		expect(trace.frames[2].snapshot.values.worker).toEqual({
			status: "known",
			value: { paid: false, attempts: 1, matrix: [[1, 2], [3, 4]], stack: [{ n: 3 }] },
		});
	});

	it("allows preactivation writes without inventing presence", () => {
		const source = authored();
		addStep(source, [
			write("pre", "staging", ["state"], { status: "known", value: "prepared" }),
		]);
		const trace = compileArtifact(source);
		expect(trace.frames[3].snapshot.values.staging)
			.toEqual({ status: "known", value: { state: "prepared" } });
		expect(trace.frames[3].snapshot.presentEntityIds).not.toContain("staging");
	});

	it("supports whole-entity known/unknown transitions and known null", () => {
		const source = authored();
		addStep(source, [
			write("unknown", "worker", [], { status: "unknown", reason: "not measured" }),
			write("known", "provider", [], { status: "known", value: null }),
		]);
		const trace = compileArtifact(source);
		expect(trace.frames[3].snapshot.values.worker)
			.toEqual({ status: "unknown", reason: "not measured" });
		expect(trace.frames[3].snapshot.values.provider)
			.toEqual({ status: "known", value: null });
	});

	it("preserves declaration-ordered topology independently of authored focus", () => {
		const source = authored();
		addStep(source, [
			{ id: "activate", type: "topology", target: "entity",
				targetId: "staging", present: true, originId: "author" },
			{ id: "connect", type: "topology", target: "relation",
				targetId: "inactive", present: true, originId: "author" },
		]);
		source.steps[2].focusEntityIds = ["provider"];
		addStep(source, [
			{ id: "deactivate", type: "topology", target: "entity",
				targetId: "worker", present: false, originId: "author" },
		], "hideWorker");
		const trace = compileArtifact(source);
		expect(trace.frames[3].snapshot.presentEntityIds)
			.toEqual(["worker", "provider", "staging"]);
		expect(trace.frames[3].snapshot.presentRelationIds)
			.toEqual(["request", "inactive"]);
		expect(trace.frames[4].snapshot.presentEntityIds)
			.toEqual(["provider", "staging"]);
		expect(trace.frames[4].snapshot.presentRelationIds)
			.toEqual(["request", "inactive"]); // relation is declared/present, projection filters endpoints
		expect(trace.frames[0].snapshot.presentEntityIds).not.toContain("staging");
	});

	it("rejects overlapping root, equal and parent/descendant writes", () => {
		const cases: SemanticEvent[][] = [
			[
				write("root", "worker", [], { status: "known", value: 5 }),
				write("child", "worker", ["paid"], { status: "known", value: true }),
			],
			[
				write("first", "worker", ["paid"], { status: "known", value: true }),
				write("again", "worker", ["paid"], { status: "known", value: false }),
			],
			[
				write("parent", "worker", ["matrix", 0], { status: "known", value: [3, 4] }),
				write("descendant", "worker", ["matrix", 0, 1], { status: "known", value: 4 }),
			],
			[
				write("child", "worker", ["matrix", 0, 1], { status: "known", value: 8 }),
				write("parent", "worker", ["matrix", 0], { status: "known", value: [9, 10] }),
			],
		];
		for (const events of cases) {
			const source = authored();
			addStep(source, events);
			assertCompilerRejects(source, "$.steps[2].events[1].path", /overlapping writes/);
		}
	});

	const nestedCases = [
		{ name: "unknown parent", path: ["missing" as const], entityId: "provider",
			target: "$.steps[2].events[0].path", reason: /unknown entity/ },
		{ name: "missing record field", path: ["nonexistent" as const], entityId: "worker",
			target: "$.steps[2].events[0].path[0]", reason: /absent/ },
		{ name: "array growth", path: ["matrix", 0, 2], entityId: "worker",
			target: "$.steps[2].events[0].path[2]", reason: /out of bounds/ },
		{ name: "wrong array path kind", path: ["matrix", "0"], entityId: "worker",
			target: "$.steps[2].events[0].path[1]", reason: /record key requires/ },
		{ name: "wrong record path kind", path: [0], entityId: "worker",
			target: "$.steps[2].events[0].path[0]", reason: /array index requires/ },
		{ name: "null intermediate parent", path: ["paid", "n"], entityId: "worker",
			target: "$.steps[2].events[0].path[1]", reason: /record key requires/ },
	];

	it.each(nestedCases)("rejects invalid nested writes: $name", ({path,entityId,target,reason}) => {
		const source = authored();
		addStep(source, [write("bad", entityId, path, { status: "known", value: 6 })]);
		assertCompilerRejects(source, target, reason);
	});

	it("rejects contradictory topology operations within one step", () => {
		const source = authored();
		addStep(source, [
			{ id: "enable", type: "topology", target: "entity",
				targetId: "staging", present: true, originId: "author" },
			{ id: "disable", type: "topology", target: "entity",
				targetId: "staging", present: false, originId: "author" },
		]);
		assertCompilerRejects(source, "$.steps[2].events[1]",
			/contradictory topology/);
	});

	it("permits redundant identical topology statements without inventing transitions", () => {
		const source = authored();
		addStep(source, [
			{ id: "on1", type: "topology", target: "entity",
				targetId: "staging", present: true, originId: "author" },
			{ id: "on2", type: "topology", target: "entity",
				targetId: "staging", present: true, originId: "author" },
		]);
		expect(compileArtifact(source).frames[3].snapshot.presentEntityIds)
			.toContain("staging");
	});

	it("rejects sent messages on an initially absent relation or endpoint", () => {
		const source = authored();
		addStep(source, [{ id: "badSend", type: "message", originId: "author",
			relationId: "inactive", messageId: "pre", phase: "sent" }]);
		assertCompilerRejects(source, "$.steps[2].events[0]",
			/present relation and both endpoints before/);
	});

	it("rejects sent messages requiring same-step activation of relation and endpoint", () => {
		const source = authored();
		addStep(source, [
			{ id: "activate", type: "topology", target: "entity",
				targetId: "staging", present: true, originId: "author" },
			{ id: "connect", type: "topology", target: "relation",
				targetId: "inactive", present: true, originId: "author" },
			{ id: "premature", type: "message", originId: "author",
				relationId: "inactive", messageId: "early", phase: "sent" },
		]);
		assertCompilerRejects(source, "$.steps[2].events[2]",
			/present relation and both endpoints before/);
	});

	it("rejects sent messages if relation or endpoint is removed in same step", () => {
		for (const event of [
			{ id: "offRelation", type: "topology" as const, target: "relation" as const,
				targetId: "request", present: false, originId: "author" },
			{ id: "offEntity", type: "topology" as const, target: "entity" as const,
				targetId: "worker", present: false, originId: "author" },
		]) {
			const source = authored();
			addStep(source, [
				{ id: "sendAgain", type: "message", originId: "author",
					relationId: "request", messageId: "charge2", phase: "sent" },
				event,
			]);
			assertCompilerRejects(source, "$.steps[2].events[0]",
				/present relation and both endpoints after/);
		}
	});

	it("accepts sent messages activated in a prior step", () => {
		const source = authored();
		addStep(source, [
			{ id: "activate", type: "topology", target: "entity",
				targetId: "staging", present: true, originId: "author" },
			{ id: "connect", type: "topology", target: "relation",
				targetId: "inactive", present: true, originId: "author" },
		]);
		addStep(source, [{ id: "sendStaged", type: "message", originId: "author",
			relationId: "inactive", messageId: "staged", phase: "sent" }], "sendNext");
		expect(compileArtifact(source).frames[4].eventIds).toEqual(["sendStaged"]);
	});

	it("validates explicit dependency references without inferring causality", () => {
		const source = authored();
		addStep(source, [write("later", "worker", ["paid"], { status: "known", value: true })]);
		(source.steps[0].events[0] as SemanticEvent).dependsOn = ["later"];
		expect(() => compileArtifact(source)).toThrow(ArtifactValidationError);
	});

	it("enforces 8M expanded-frame units even when copy-on-write is memory-efficient", () => {
		const source = authored();
		source.entities = Array.from({ length: 20 }, (_, i) => ({
			id: "big" + i, label: "Large value" + i,
		}));
		source.relations = [];
		source.initialState = Object.fromEntries(source.entities.map((entity) =>
			[entity.id, { status: "known", value: Array(500).fill(0) }])) as Record<string, Cell>;
		source.steps = Array.from({ length: 500 }, (_, i) => ({
			id: "read" + i, label: "Observe without changing any state", events: [],
		}));
		expect(ARTIFACT_LIMITS.traceUnits).toBe(8_000_000);
		expect(() => compileArtifact(source))
			.toThrow(/expanded trace exceeds 8,000,000/);
	});

	it("rejects malformed nested JSON even if the source is cast as typed", () => {
		const source = authored();
		source.initialState.worker = { status: "known", value: [NaN] };
		expect(() => compileArtifact(source)).toThrow(ArtifactValidationError);
	});
});


describe("TL-U03 — compiler resource-boundary regression", () => {
	it("batches 10,000 disjoint writes into one 200,000-element array copy", () => {
		// This valid, near-limit input previously performed approximately
		// 2 billion array-element definitions (n*m). The accepted v2 limits
		// permit it; each touched container must be copied only once.
		const arrayLength = 200_000;
		const writeCount = ARTIFACT_LIMITS.events;
		const source = authored();
		source.entities = [{ id: "worker", label: "Worker" }];
		source.relations = [];
		source.initialState = {
			worker: { status: "known", value: Array(arrayLength).fill(0) },
		};
		source.steps = [{
			id: "batch", label: "Independent indexed writes", events:
				Array.from({ length: writeCount }, (_, i) =>
					write("put" + i, "worker", [i * 19], { status: "known", value: i + 1 })),
		}];
		const fixtureSHA256 = createHash("sha256")
			.update(serializeArtifact(source)).digest("hex");
		const start = performance.now();
		const trace = compileArtifact(source);
		const elapsedMs = performance.now() - start;

		expect(trace.frames.map((frame) => frame.id)).toEqual(["@initial", "batch"]);
		const before = trace.frames[0].snapshot.values.worker;
		const after = trace.frames[1].snapshot.values.worker;
		expect(before.status).toBe("known");
		expect(after.status).toBe("known");
		if (before.status !== "known" || after.status !== "known") return;
		const original = before.value as number[];
		const result = after.value as number[];
		expect(result).toHaveLength(arrayLength);
		expect(original[0]).toBe(0);
		expect(original[arrayLength - 1]).toBe(0);
		expect(result[0]).toBe(1);
		expect(result[19]).toBe(2);
		expect(result[19 * (writeCount - 1)]).toBe(writeCount);
		expect(result[1]).toBe(0);
		expect(result[arrayLength - 1]).toBe(0);
		expect(Object.isFrozen(result)).toBe(true);

		// Report a real named-hardware measurement rather than inventing a
		// portability-sensitive wall-clock SLA. CI retains the benchmark log.
		console.info("TL-U03 boundary benchmark:", JSON.stringify({
			fixtureSHA256,
			arrayLength,
			writeCount,
			node: process.version,
			platform: process.platform,
			cpu: cpus()[0]?.model ?? "unknown",
			compileMs: Number(elapsedMs.toFixed(1)),
		}));
	}, 60_000);

	it("rejects 2,001 expanded frames when ID string values push work over 8M", () => {
		// With 200 entities and 1,000 present relations, each frame consumes
		// 1,200 extra units for the ID string primitives. Counting only array
		// slots wrongly accepts this input (~7.2M instead of >9.6M units).
		const source = authored();
		source.entities = Array.from({ length: ARTIFACT_LIMITS.entities },
			(_, i) => ({ id: "entity" + i, label: "Entity " + i }));
		source.relations = Array.from({ length: ARTIFACT_LIMITS.relations },
			(_, i) => ({ id: "relation" + i, from: "entity0", to: "entity1" }));
		source.initialState = Object.fromEntries(source.entities.map((entity) => [
			entity.id, { status: "known", value: [0, 0, 0] },
		])) as Record<string, Cell>;
		source.steps = Array.from({ length: ARTIFACT_LIMITS.steps },
			(_, i) => ({ id: "empty" + i, label: "No operations", events: [] }));

		try {
			compileArtifact(source);
		} catch (error) {
			expect(error).toBeInstanceOf(ArtifactCompilationError);
			const rejection = error as ArtifactCompilationError;
			expect(rejection.path).toMatch(/^frames\\[\\d+\\]$/);
			expect(rejection.message).toMatch(/expanded trace exceeds 8,000,000 traversal units/);
			return;
		}
		throw new Error("The 8M budget must count array slots AND their string values");
	}, 60_000);
});
