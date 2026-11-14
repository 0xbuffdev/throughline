import { describe, expect, it } from "vitest";
import {
	ARTIFACT_LIMITS,
	ArtifactValidationError,
	parseArtifactJson,
	serializeArtifact,
	validateArtifact,
	type VisualArtifact,
} from "../index.js";

const base = (): VisualArtifact => ({
	schemaVersion: 2,
	id: "checkout",
	title: "Checkout evidence",
	origins: [{ id: "author", kind: "authored" }, { id: "observer", kind: "observed" }],
	groups: [{ id: "app", label: "Application" }, { id: "service", label: "Service", parentId: "app" }],
	entities: [
		{ id: "worker", label: "Worker", groupId: "app" },
		{ id: "provider", label: "Provider", groupId: "service" },
	],
	relations: [{ id: "channel", from: "worker", to: "provider" }],
	initialState: {
		worker: { status: "known", value: { paid: false, attempts: 0 } },
		provider: { status: "unknown", reason: "not observed" },
	},
	steps: [
		{
			id: "dispatch",
			label: "Request sent",
			time: { kind: "logical", tick: 0 },
			focusEntityIds: ["worker"],
			events: [
				{ id: "write_attempts", type: "write", entityId: "worker",
					path: ["attempts"], value: { status: "known", value: 1 }, originId: "author" },
				{ id: "sent", type: "message", relationId: "channel",
					messageId: "request", phase: "sent", originId: "author" },
			],
		},
		{
			id: "isolated_receipt",
			label: "Provider saw request but worker lacks acknowledgement",
			time: { kind: "wall", iso8601: "2026-11-14T09:10:11+01:00" },
			events: [
				{ id: "received", type: "message", relationId: "channel",
					messageId: "request", phase: "received", originId: "observer",
					dependsOn: ["sent"] },
				{ id: "observation", type: "observation", entityId: "provider",
					value: { status: "known", value: "request observed" }, originId: "observer" },
			],
		},
	],
	claims: [{ id: "assumption", kind: "assumption", originId: "author",
		text: "The request may be processed", evidenceEventIds: [],
		review: "unreviewed" }],
	views: [{ kind: "sequence", priority: 0 }, { kind: "state-table", priority: 1 }],
});

function invalid(mutator: (input: VisualArtifact) => void): void {
	const input = base();
	mutator(input);
	expect(() => validateArtifact(input)).toThrow(ArtifactValidationError);
}

describe("TL-U02 — schema-2 structural contract", () => {
	it("accepts valid reference evidence without inferring delivery, persistence or acknowledgement", () => {
		const artifact = validateArtifact(base());
		expect(artifact.schemaVersion).toBe(2);
		expect(artifact.steps[1].events.map((e) => e.type)).toEqual(["message", "observation"]);
		expect(artifact.initialState.provider).toEqual({ status: "unknown", reason: "not observed" });
		expect(artifact.initialState.worker).toEqual({
			status: "known", value: { paid: false, attempts: 0 },
		});
	});

	it("supports recursion, matrix and checkout through the identical event/cell grammar", () => {
		for (const scenario of [
			{ id: "factorial", value: [{ frame: "factorial4", n: 4 }], next: [{ frame: "factorial3", n: 3 }] },
			{ id: "matrix", value: [[1, 2], [3, 4]], next: [[7, 10], [15, 22]] },
			{ id: "checkout", value: { status: "unpaid" }, next: { status: "unknown" } },
		]) {
			const artifact = validateArtifact({
				schemaVersion: 2, id: scenario.id, origins: [{ id: "source", kind: "computed" }],
				entities: [{ id: "state", label: "State" }], relations: [],
				initialState: { state: { status: "known", value: scenario.value } },
				steps: [{ id: "step1", label: "Explicit transition", events: [
					{ id: "event1", type: "write", originId: "source",
						entityId: "state", path: [], value: { status: "known", value: scenario.next } },
				] }],
			});
			expect(artifact.steps[0].events).toHaveLength(1);
		}
	});

	it("detaches and deeply freezes arbitrary trusted input before exposing it", () => {
		const input = base();
		const artifact = validateArtifact(input);
		(input.initialState.worker as { status: "known"; value: { attempts: number } }).value.attempts = 99;
		input.steps[0].events.length = 0;
		expect(artifact.steps[0].events).toHaveLength(2);
		expect(artifact.initialState.worker).toEqual({
			status: "known", value: { paid: false, attempts: 0 },
		});
		expect(Object.isFrozen(artifact)).toBe(true);
		expect(Object.isFrozen(artifact.steps[0].events)).toBe(true);
		expect(Object.isFrozen(artifact.initialState.worker)).toBe(true);
		expect(Object.isFrozen((artifact.initialState.worker as { value: object }).value)).toBe(true);
	});

	it("keeps null distinct from unknown and permits pre-activation authored values", () => {
		const input = base();
		input.initialState.provider = { status: "known", value: null };
		input.entities[1].initiallyPresent = false;
		input.steps[0].events.push({
			id: "preactivate", type: "write", originId: "author",
			entityId: "provider", path: [], value: { status: "unknown", reason: "not yet visible" },
		});
		const artifact = validateArtifact(input);
		expect(artifact.initialState.provider).toEqual({ status: "known", value: null });
		expect(artifact.entities[1].initiallyPresent).toBe(false);
	});

	it("rejects unsupported versions before reading nested input", () => {
		let accessed = false;
		const fake = { schemaVersion: 1, get steps() { accessed = true; throw new Error("untrusted"); } };
		expect(() => validateArtifact(fake)).toThrow(/schemaVersion/);
		expect(accessed).toBe(false);
	});

	it("rejects invalid identities, duplicate namespace IDs and missing references", () => {
		invalid((v) => { v.entities[0].id = "bad id"; });
		invalid((v) => { v.entities.push({ ...v.entities[0] }); });
		invalid((v) => { v.steps[0].events[1].id = "write_attempts"; });
		invalid((v) => { v.relations[0].to = "nobody"; });
		invalid((v) => { v.entities[0].groupId = "missing"; });
		invalid((v) => { v.steps[0].events[0].originId = "missing"; });
		invalid((v) => { v.initialState.worker = undefined as never; });
		invalid((v) => { delete v.initialState.provider; });
		invalid((v) => { v.initialState.extra = { status: "known", value: 1 }; });
	});

	it("enforces static groups, cycles and max depth", () => {
		invalid((v) => { v.groups![0].parentId = "service"; });
		invalid((v) => { v.groups![1].parentId = "unknown"; });
		const input = base();
		input.groups = Array.from({ length: 33 }, (_, i) => ({
			id: "g" + i, label: "G", ...(i ? { parentId: "g" + (i - 1) } : {}),
		}));
		expect(() => validateArtifact(input)).toThrow(/group tree exceeds depth 32/);
	});

	it("rejects unknown event vocabulary, malformed paths, references and clocks", () => {
		invalid((v) => { (v.steps[0].events[0] as { type: string }).type = "send"; });
		invalid((v) => { (v.steps[0].events[0] as { path: (string | number)[] }).path = ["__proto__"]; });
		invalid((v) => { (v.steps[0].events[0] as { path: (string | number)[] }).path = [-1]; });
		invalid((v) => { (v.steps[0].events[0] as { path: (string | number)[] }).path = [1.5]; });
		invalid((v) => { (v.steps[0].events[0] as { value: unknown }).value = { status: "unknown" }; });
		invalid((v) => { v.steps[0].events[0].dependsOn = ["sent"]; });
		invalid((v) => { v.steps[1].events[0].dependsOn = ["observation"]; });
		invalid((v) => { v.steps[0].time = { kind: "wall", iso8601: "2026-02-30T13:00:00Z" }; });
		invalid((v) => { v.steps[0].time = { kind: "wall", iso8601: "2026-11-14" }; });
		invalid((v) => { v.steps[0].time = { kind: "logical", tick: -1 }; });
		invalid((v) => { (v.views![0] as { priority: number }).priority = NaN; });
	});

	it("rejects message ID reuse on unrelated relations and bad evidence", () => {
		invalid((v) => {
			v.relations.push({ id: "reverse", from: "provider", to: "worker" });
			v.steps[1].events.push({ id: "wrong_relation", type: "message",
				originId: "observer", relationId: "reverse",
				messageId: "request", phase: "processed" });
		});
		invalid((v) => { v.claims![0].evidenceEventIds = ["future"]; });
	});

	it("rejects extra fields and invalid record-cell encoding", () => {
		invalid((v) => { (v as VisualArtifact & { privateSource?: string }).privateSource = "secret"; });
		invalid((v) => { v.initialState.provider = { status: "known", value: null, reason: "invalid" } as never; });
		invalid((v) => { v.initialState.provider = { status: "unknown", value: null } as never; });
		invalid((v) => { v.steps[0].events[0].dependsOn = ["" ]; });
	});

	it("rejects non-JSON primitives, cycles, getters, prototypes and ill-formed Unicode", () => {
		invalid((v) => { v.initialState.worker = { status: "known", value: Infinity }; });
		invalid((v) => { v.initialState.worker = { status: "known", value: -Infinity }; });
		invalid((v) => { v.initialState.worker = { status: "known", value: NaN }; });
		invalid((v) => { v.initialState.worker = { status: "known", value: new Date() } as never; });
		invalid((v) => { v.initialState.worker = { status: "known", value: "\ud800" }; });
		invalid((v) => { v.initialState.worker = { status: "known", value: (() => 1) } as never; });
		invalid((v) => {
			const cyclic: unknown[] = [];
			cyclic.push(cyclic);
			v.initialState.worker = { status: "known", value: cyclic as never };
		});
		invalid((v) => {
			const obj: Record<string, unknown> = {};
			Object.defineProperty(obj, "secret", { enumerable: true, get() { throw Error("must not run"); } });
			v.initialState.worker = { status: "known", value: obj as never };
		});
		invalid((v) => {
			v.initialState.worker = { status: "known", value: Object.assign(Object.create(null), {
				constructor: "unsafe",
			}) as never };
		});
	});

	it("enforces cumulative count, nesting, byte and traversal budgets", () => {
		const tooManyEntities = base();
		tooManyEntities.entities = Array.from({ length: ARTIFACT_LIMITS.entities + 1 },
			(_, i) => ({ id: "entity" + i, label: "E" }));
		expect(() => validateArtifact(tooManyEntities)).toThrow(/maximum 200/);
		const tooManyEvents = base();
		tooManyEvents.steps = [{
			id: "step1", label: "events",
			events: Array.from({ length: ARTIFACT_LIMITS.events + 1 }, (_, i) => ({
				id: "event" + i, type: "observation" as const, originId: "author",
				entityId: "worker", value: { status: "known" as const, value: null },
			})),
		}];
		expect(() => validateArtifact(tooManyEvents)).toThrow(/10,000 events/);
		const tooDeep = base();
		let nested: unknown = "leaf";
		for (let i = 0; i < 33; i++) nested = [nested];
		tooDeep.initialState.worker = { status: "known", value: nested as never };
		expect(() => validateArtifact(tooDeep)).toThrow(/nesting exceeds 32/);
		const tooLarge = base();
		tooLarge.initialState.worker = { status: "known", value: "x".repeat(ARTIFACT_LIMITS.artifactBytes) };
		expect(() => validateArtifact(tooLarge)).toThrow(/4 MiB/);
		const tooMuchWork = base();
		tooMuchWork.initialState.worker = { status: "known", value: Array(500_001).fill(0) };
		expect(() => validateArtifact(tooMuchWork)).toThrow(/work limit/);
	});
});

describe("TL-U02 — strict serialized artifact boundary", () => {
	it("round-trips a canonical JSON encoding independent of object-key insertion order", () => {
		const artifact = base();
		const first = serializeArtifact(artifact);
		const reordered = { steps: artifact.steps, initialState: artifact.initialState,
			entities: artifact.entities, groups: artifact.groups, origins: artifact.origins,
			relations: artifact.relations, claims: artifact.claims, views: artifact.views,
			id: artifact.id, title: artifact.title, schemaVersion: 2 };
		expect(serializeArtifact(reordered as VisualArtifact)).toBe(first);
		expect(parseArtifactJson(first)).toEqual(validateArtifact(artifact));
		expect(serializeArtifact(parseArtifactJson(first))).toBe(first);
	});

	it("rejects duplicate root, nested and escaped JSON keys", () => {
		expect(() => parseArtifactJson('{"schemaVersion":2,"schemaVersion":2}'))
			.toThrow(/duplicate object key/);
		expect(() => parseArtifactJson('{"schemaVersion":2,"initialState":{"x":1,"x":2}}'))
			.toThrow(/duplicate object key/);
		expect(() => parseArtifactJson('{"schemaVersion":2,"foo":0,"f\\u006fo":1}'))
			.toThrow(/duplicate object key/);
	});

	it("rejects invalid JSON, malformed surrogate data and oversized input", () => {
		expect(() => parseArtifactJson('{"schemaVersion":2,}')).toThrow(ArtifactValidationError);
		expect(() => parseArtifactJson('{"schemaVersion":2}[]')).toThrow(ArtifactValidationError);
		expect(() => parseArtifactJson(serializeArtifact(base()).replace("checkout", "\\ud800")))
			.toThrow(/surrogate/);
		expect(() => parseArtifactJson(" ".repeat(ARTIFACT_LIMITS.artifactBytes + 1)))
			.toThrow(/4 MiB/);
	});

	it("does not accept v1 traces or externally serialized compiled frames as artifacts", () => {
		expect(() => validateArtifact({ version: 1, frames: [] })).toThrow(/schemaVersion/);
		expect(() => validateArtifact({ schemaVersion: 2, frames: [], id: "x" }))
			.toThrow(/required property|unexpected property/);
	});
});
