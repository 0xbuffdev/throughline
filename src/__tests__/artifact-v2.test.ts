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
		invalid((v) => { (v.steps[0].events[0] as unknown as { path: (string | number)[] }).path = ["__proto__"]; });
		invalid((v) => { (v.steps[0].events[0] as unknown as { path: (string | number)[] }).path = [-1]; });
		invalid((v) => { (v.steps[0].events[0] as unknown as { path: (string | number)[] }).path = [1.5]; });
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


function expectRejectedAt(
	input: VisualArtifact,
	path: string,
	detail: RegExp,
): void {
	try {
		validateArtifact(input);
	} catch (error) {
		expect(error).toBeInstanceOf(ArtifactValidationError);
		const rejection = error as ArtifactValidationError;
		expect(rejection.path).toBe(path);
		expect(rejection.message).toMatch(detail);
		return;
	}
	throw new Error("Expected artifact rejection at " + path);
}

describe("TL-U02 / IR-01 — exhaustive structural rejection matrix", () => {
	const collectionCases: {
		name: string;
		mutate: (artifact: VisualArtifact) => void;
		path: string;
		reason: RegExp;
	}[] = [
		{
			name: "entities",
			mutate: (v) => {
				v.entities = Array.from({ length: ARTIFACT_LIMITS.entities + 1 },
					(_, i) => ({ id: "entity" + i, label: "Entity " + i }));
			},
			path: "$.entities",
			reason: /exceeds maximum 200/,
		},
		{
			name: "relations",
			mutate: (v) => {
				v.relations = Array.from({ length: ARTIFACT_LIMITS.relations + 1 },
					(_, i) => ({ id: "relation" + i, from: "worker", to: "provider" }));
			},
			path: "$.relations",
			reason: /exceeds maximum 1000/,
		},
		{
			name: "groups",
			mutate: (v) => {
				v.groups = Array.from({ length: ARTIFACT_LIMITS.groups + 1 },
					(_, i) => ({ id: "group" + i, label: "Group " + i }));
			},
			path: "$.groups",
			reason: /exceeds maximum 200/,
		},
		{
			name: "steps",
			mutate: (v) => {
				v.steps = Array.from({ length: ARTIFACT_LIMITS.steps + 1 },
					(_, i) => ({ id: "step" + i, label: "Step", events: [] }));
			},
			path: "$.steps",
			reason: /exceeds maximum 2000/,
		},
		{
			name: "events",
			mutate: (v) => {
				v.steps[0].events = Array.from({ length: ARTIFACT_LIMITS.events + 1 },
					(_, i) => ({
						id: "event" + i, originId: "author", type: "observation" as const,
						entityId: "worker", value: { status: "known" as const, value: null },
					}));
			},
			path: "$.steps[0].events",
			reason: /more than 10,000 events/,
		},
		{
			name: "claims",
			mutate: (v) => {
				v.claims = Array.from({ length: ARTIFACT_LIMITS.claims + 1 },
					(_, i) => ({
						id: "claim" + i, text: "Unverified", kind: "assumption" as const,
						originId: "author", evidenceEventIds: [], review: "unreviewed" as const,
					}));
			},
			path: "$.claims",
			reason: /exceeds maximum 1000/,
		},
	];

	it.each(collectionCases)("rejects over-limit $name at the declared collection", ({ mutate, path, reason }) => {
		const input = base();
		mutate(input);
		expectRejectedAt(input, path, reason);
	});

	const referenceCases: {
		name: string;
		mutate: (artifact: VisualArtifact) => void;
		path: string;
		reason: RegExp;
	}[] = [
		{
			name: "group parentId",
			mutate: (v) => { v.groups![1].parentId = "undeclared"; },
			path: "$.groups",
			reason: /undeclared parent for service: undeclared/,
		},
		{
			name: "entity groupId",
			mutate: (v) => { v.entities[0].groupId = "undeclared"; },
			path: "$.entities[0].groupId",
			reason: /undeclared reference: undeclared/,
		},
		{
			name: "relation from",
			mutate: (v) => { v.relations[0].from = "undeclared"; },
			path: "$.relations[0].from",
			reason: /undeclared reference: undeclared/,
		},
		{
			name: "relation to",
			mutate: (v) => { v.relations[0].to = "undeclared"; },
			path: "$.relations[0].to",
			reason: /undeclared reference: undeclared/,
		},
		{
			name: "step focusEntityIds",
			mutate: (v) => { v.steps[0].focusEntityIds = ["undeclared"]; },
			path: "$.steps[0].focusEntityIds[0]",
			reason: /undeclared reference: undeclared/,
		},
		{
			name: "write entityId",
			mutate: (v) => {
				const event = v.steps[0].events[0];
				if (event.type !== "write") throw Error("unexpected reference fixture");
				event.entityId = "undeclared";
			},
			path: "$.steps[0].events[0].entityId",
			reason: /undeclared reference: undeclared/,
		},
		{
			name: "topology entity targetId",
			mutate: (v) => {
				v.steps[0].events.push({ id: "topoEntity", type: "topology",
					target: "entity", targetId: "undeclared", present: true, originId: "author" });
			},
			path: "$.steps[0].events[2].targetId",
			reason: /undeclared reference: undeclared/,
		},
		{
			name: "topology relation targetId",
			mutate: (v) => {
				v.steps[0].events.push({ id: "topoRelation", type: "topology",
					target: "relation", targetId: "undeclared", present: false, originId: "author" });
			},
			path: "$.steps[0].events[2].targetId",
			reason: /undeclared reference: undeclared/,
		},
		{
			name: "message relationId",
			mutate: (v) => {
				const event = v.steps[0].events[1];
				if (event.type !== "message") throw Error("unexpected reference fixture");
				event.relationId = "undeclared";
			},
			path: "$.steps[0].events[1].relationId",
			reason: /undeclared reference: undeclared/,
		},
		{
			name: "observation entityId",
			mutate: (v) => {
				const event = v.steps[1].events[1];
				if (event.type !== "observation") throw Error("unexpected reference fixture");
				event.entityId = "undeclared";
			},
			path: "$.steps[1].events[1].entityId",
			reason: /undeclared reference: undeclared/,
		},
		{
			name: "write originId",
			mutate: (v) => { v.steps[0].events[0].originId = "undeclared"; },
			path: "$.steps[0].events[0].originId",
			reason: /undeclared reference: undeclared/,
		},
		{
			name: "observation originId",
			mutate: (v) => { v.steps[1].events[1].originId = "undeclared"; },
			path: "$.steps[1].events[1].originId",
			reason: /undeclared reference: undeclared/,
		},
		{
			name: "event dependsOn",
			mutate: (v) => { v.steps[1].events[1].dependsOn = ["undeclared"]; },
			path: "$.steps[1].events[1].dependsOn[0]",
			reason: /undeclared reference: undeclared/,
		},
		{
			name: "event dependsOn self/same-step",
			mutate: (v) => { v.steps[1].events[1].dependsOn = ["received"]; },
			path: "$.steps[1].events[1].dependsOn[0]",
			reason: /undeclared reference: received/,
		},
		{
			name: "event dependsOn future step",
			mutate: (v) => { v.steps[0].events[0].dependsOn = ["received"]; },
			path: "$.steps[0].events[0].dependsOn[0]",
			reason: /undeclared reference: received/,
		},
		{
			name: "claim originId",
			mutate: (v) => { v.claims![0].originId = "undeclared"; },
			path: "$.claims[0].originId",
			reason: /undeclared reference: undeclared/,
		},
		{
			name: "claim evidenceEventIds",
			mutate: (v) => { v.claims![0].evidenceEventIds = ["undeclared"]; },
			path: "$.claims[0].evidenceEventIds[0]",
			reason: /undeclared reference: undeclared/,
		},
		{
			name: "missing initialState entry",
			mutate: (v) => { delete v.initialState.provider; },
			path: "$.initialState.provider",
			reason: /missing initial cell/,
		},
		{
			name: "undeclared initialState key",
			mutate: (v) => { v.initialState.undeclared = { status: "known", value: 1 }; },
			path: "$.initialState.undeclared",
			reason: /unexpected property/,
		},
	];

	it.each(referenceCases)("rejects invalid $name with an exact diagnostic path", ({ mutate, path, reason }) => {
		const input = base();
		mutate(input);
		expectRejectedAt(input, path, reason);
	});

	const duplicates: {
		name: string;
		mutate: (artifact: VisualArtifact) => void;
		path: string;
		reason: RegExp;
	}[] = [
		{
			name: "origins",
			mutate: (v) => { v.origins.push({ id: "author", kind: "authored" }); },
			path: "$.origins[2].id",
			reason: /duplicate identifier: author/,
		},
		{
			name: "groups",
			mutate: (v) => { v.groups!.push({ id: "app", label: "Duplicate" }); },
			path: "$.groups[2].id",
			reason: /duplicate group ID/,
		},
		{
			name: "entities",
			mutate: (v) => { v.entities.push({ id: "worker", label: "Duplicate" }); },
			path: "$.entities[2].id",
			reason: /duplicate identifier: worker/,
		},
		{
			name: "relations",
			mutate: (v) => { v.relations.push({ id: "channel", from: "worker", to: "provider" }); },
			path: "$.relations[1].id",
			reason: /duplicate identifier: channel/,
		},
		{
			name: "steps",
			mutate: (v) => { v.steps.push({ id: "dispatch", label: "Duplicate", events: [] }); },
			path: "$.steps[2].id",
			reason: /duplicate identifier: dispatch/,
		},
		{
			name: "events",
			mutate: (v) => { v.steps[1].events[1].id = "sent"; },
			path: "$.steps[1].events[1].id",
			reason: /duplicate event ID: sent/,
		},
		{
			name: "claims",
			mutate: (v) => { v.claims!.push({ ...v.claims![0] }); },
			path: "$.claims[1].id",
			reason: /duplicate identifier: assumption/,
		},
	];

	it.each(duplicates)("rejects duplicate IDs within the $name namespace", ({ mutate, path, reason }) => {
		const input = base();
		mutate(input);
		expectRejectedAt(input, path, reason);
	});
});

describe("TL-U02 — inherited prototype behavior regression", () => {
	it("never invokes inherited setters or toJSON hooks during validation, sizing or serialization", () => {
		const input = base();
		input.initialState.worker = {
			status: "known",
			value: { harmless: 23, nested: [5, { more: true }] },
		};
		const oldSetter = Object.getOwnPropertyDescriptor(Object.prototype, "harmless");
		const oldToJson = Object.getOwnPropertyDescriptor(Object.prototype, "toJSON");
		let inheritedSetterCalls = 0;
		let inheritedToJsonCalls = 0;
		let validated: VisualArtifact | undefined;
		let serialized: string | undefined;
		let decoded: VisualArtifact | undefined;
		try {
			Object.defineProperty(Object.prototype, "harmless", {
				configurable: true,
				set() { inheritedSetterCalls++; },
			});
			Object.defineProperty(Object.prototype, "toJSON", {
				configurable: true,
				value() { inheritedToJsonCalls++; return "poisoned"; },
			});
			validated = validateArtifact(input);
			serialized = serializeArtifact(validated);
			decoded = parseArtifactJson(serialized);
		} finally {
			if (oldSetter) Object.defineProperty(Object.prototype, "harmless", oldSetter);
			else Reflect.deleteProperty(Object.prototype, "harmless");
			if (oldToJson) Object.defineProperty(Object.prototype, "toJSON", oldToJson);
			else Reflect.deleteProperty(Object.prototype, "toJSON");
		}
		expect(inheritedSetterCalls).toBe(0);
		expect(inheritedToJsonCalls).toBe(0);
		expect(validated?.initialState.worker).toEqual(input.initialState.worker);
		expect(decoded?.initialState.worker).toEqual(input.initialState.worker);
		expect(serialized).toContain('"harmless":23');
		expect(serialized).toContain('"nested":[5,{"more":true}]');
	});

	it("preserves valid own record keys named toJSON without invoking them", () => {
		const input = base();
		input.initialState.worker = {
			status: "known",
			value: { toJSON: "plain inert JSON field", constructorName: "accepted" },
		};
		const parsed = parseArtifactJson(serializeArtifact(input));
		expect(parsed.initialState.worker).toEqual(input.initialState.worker);
	});
});


describe("Schema-2 validation boundary regressions", () => {
	it.each(["groups", "claims", "views"] as const)("rejects explicit null for optional %s", key => {
		const input = base();
		Object.defineProperty(input, key, { value: null, enumerable: true });
		expect(() => validateArtifact(input)).toThrow(`$.${key}: expected an array`);
		expect(() => parseArtifactJson(JSON.stringify(input))).toThrow(`$.${key}: expected an array`);
	});
	it("accepts omitted and empty optional collections", () => {
		const input = base();
		delete input.groups; delete input.claims; delete input.views;
		for (const entity of input.entities) delete entity.groupId;
		expect(parseArtifactJson(serializeArtifact(input))).toEqual(input);
		input.groups = []; input.claims = []; input.views = [];
		expect(parseArtifactJson(serializeArtifact(input))).toEqual(input);
	});
	it("charges repeated and escaped strings before full serialization", () => {
		const input = base();
		const text = "\u0000".repeat(350_000); // six JSON bytes per code unit
		input.initialState.worker = { status: "known", value: [text, text] };
		expect(() => validateArtifact(input)).toThrow(/4 MiB/);
		const emoji = "🙂".repeat(600_000);
		input.initialState.worker = { status: "known", value: [emoji, emoji] };
		expect(() => validateArtifact(input)).toThrow(/4 MiB/);
	});
	it("matches canonical byte size at the exact UTF-8 ceiling", () => {
		const input = base();
		input.title = "é🙂\u0000\n\\\"";
		const before = new TextEncoder().encode(serializeArtifact(input)).length;
		input.title += "a".repeat(ARTIFACT_LIMITS.artifactBytes - before);
		const encoded = serializeArtifact(input);
		expect(new TextEncoder().encode(encoded).length).toBe(ARTIFACT_LIMITS.artifactBytes);
		expect(parseArtifactJson(encoded).title).toBe(input.title);
		input.title += "a";
		expect(() => validateArtifact(input)).toThrow(/4 MiB/);
	}, 20_000);
	it("round-trips an artifact above half the structural budget", () => {
		const input = base();
		input.initialState.worker = { status: "known", value: Array(260_000).fill(0) };
		const encoded = serializeArtifact(input);
		expect(serializeArtifact(parseArtifactJson(encoded))).toBe(encoded);
	}, 20_000);
	it("rejects write paths deeper than the query ceiling", () => {
		const input = base();
		const event = input.steps[0].events[0];
		if (event.type !== "write") throw new Error("expected fixture write");
		event.path = Array(33).fill("a");
		expect(() => validateArtifact(input)).toThrow(/path: exceeds maximum 32/);
	});
});
