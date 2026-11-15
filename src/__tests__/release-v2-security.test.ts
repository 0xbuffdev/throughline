import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import {
	artifactRelativePath, compileArtifact, parseArtifactJson, projectView,
	inspectTrace, serializeArtifact, validateArtifact, type VisualArtifact,
} from "../index.js";

/**
 * Deterministic hostile-input sweep for TL-U18. The seed and case table are
 * committed, so a CI failure is reproducible without hidden randomness.
 * This augments, but does not replace, the dedicated validator/CLI tests.
 */
const SEED = 0x18a2b47d;
function rng(seed: number) {
	let state = seed >>> 0;
	return () => {
		state ^= state << 13;
		state ^= state >>> 17;
		state ^= state << 5;
		return state >>> 0;
	};
}
function base(): VisualArtifact {
	return {
		schemaVersion: 2, id: "secureTrace",
		origins: [{ id: "author", kind: "authored" }],
		entities: [{ id: "source", label: "Source" },
			{ id: "target", label: "Target" }],
		relations: [{ id: "channel", from: "source", to: "target" }],
		initialState: {
			source: { status: "known", value: { count: 0, status: null } },
			target: { status: "unknown", reason: "not measured" },
		},
		steps: [
			{ id: "dispatch", label: "Dispatch", events: [
				{ id: "sent", type: "message", originId: "author",
					relationId: "channel", messageId: "work", phase: "sent" },
			] },
			{ id: "change", label: "Change", events: [
				{ id: "write", type: "write", originId: "author",
					entityId: "source", path: ["count"],
					value: { status: "known", value: 1 } },
			] },
		],
	};
}
const adversaries = [
	{ name: "legacy-schema", mutate: (text: string) => text.replace('"schemaVersion":2', '"schemaVersion":1') },
	{ name: "duplicate-json-key", mutate: (text: string) => text.replace('"schemaVersion":2', '"schemaVersion":2,"schemaVersion":2') },
	{ name: "trailing-code", mutate: (text: string) => text + "\n; process.exit(0)" },
	{ name: "unknown-origin", mutate: (text: string) => text.replace('"originId":"author"', '"originId":"unregistered"') },
	{ name: "bad-entity-id", mutate: (text: string) => text.replace('"id":"source"', '"id":"../source"') },
	{ name: "missing-relation-endpoint", mutate: (text: string) => text.replace('"to":"target"', '"to":"nowhere"') },
	{ name: "unrecognized-event", mutate: (text: string) => text.replace('"type":"message"', '"type":"evaluate"') },
	{ name: "bad-phase", mutate: (text: string) => text.replace('"phase":"sent"', '"phase":"persisted"') },
	{ name: "unknown-cell-vocabulary", mutate: (text: string) => text.replace('"status":"unknown"', '"status":"probably"') },
	{ name: "prototype-property", mutate: (text: string) => text.replace('"count":0', '"__proto__":0,"count":0') },
	{ name: "conflicting-same-step-write", mutate: (text: string) => {
		const altered = JSON.parse(text) as VisualArtifact;
		altered.steps[1].events.unshift({
			id: "overlap", type: "write", originId: "author", entityId: "source",
			path: ["count"], value: { status: "known", value: 5 },
		});
		return JSON.stringify(altered);
	} },
	{ name: "lone-surrogate", mutate: (text: string) => text.replace('"label":"Source"', '"label":"\\uD800"') },
] as const;

it("TL-U18 rejects seeded malformed and malicious schema-2 inputs without executing or modifying caller data", () => {
	const next = rng(SEED);
	const input = base();
	const canonical = serializeArtifact(input);
	const outcomes: Record<string, number> = Object.create(null);
	const total = 144;
	const protectedPrototype = Object.prototype.hasOwnProperty.call(Object.prototype, "polluted");
	expect(protectedPrototype).toBe(false);
	for (let iteration = 0; iteration < total; iteration++) {
		const caseIndex = next() % adversaries.length;
		const chosen = adversaries[caseIndex];
		const altered = chosen.mutate(canonical);
		expect(altered, "mutation " + chosen.name).not.toBe(canonical);
		expect(() => compileArtifact(parseArtifactJson(altered)),
			"Adversarial case " + chosen.name + " #" + iteration).toThrow();
		outcomes[chosen.name] = (outcomes[chosen.name] ?? 0) + 1;
	}
	// The original remains valid, returns only authored evidence, and the
	// rejected prototype key never leaks to any object.
	const trace = compileArtifact(input);
	expect(trace.frames).toHaveLength(3);
	expect(inspectTrace(trace).valueAt(1, "target").status).toBe("unknown");
	expect(projectView(inspectTrace(trace), { frameIndex: 1, kind: "sequence" })
		.items.some(item => item.source.eventIds?.includes("sent"))).toBe(true);
	expect(Object.prototype.hasOwnProperty.call(Object.prototype, "polluted")).toBe(false);
	expect(serializeArtifact(input)).toBe(canonical);

	const invalidPaths = [
		"../outside.json", "/tmp/file", "./artifact.json", "nested/../file",
		"nested//file", "nested\\file", "%2e%2e/file", "nested/%2fsecret",
		"nested/\0secret", "C:/windows/system32",
	];
	for (const path of invalidPaths)
		expect(() => artifactRelativePath(path), "unsafe path " + JSON.stringify(path)).toThrow();
	expect(artifactRelativePath("content/docs/model.mdx")).toBe("content/docs/model.mdx");

	const evidence = {
		ticket: "TL-U18", gate: "seeded-malicious-input-sweep",
		status: "pass", seed: "0x" + SEED.toString(16),
		iterations: total, rejected: total, cases: outcomes,
		pathRejections: invalidPaths.length, validBaselineReplayed: true,
		source: process.env.THL_SOURCE_SHA ?? process.env.GITHUB_SHA ?? "local-unverified",
		note: "Mutation sweep is not a formal proof; existing dedicated security and CLI cases also run.",
	};
	mkdirSync(join(process.cwd(), ".release-evidence"), { recursive: true });
	writeFileSync(join(process.cwd(), ".release-evidence", "v2-security.json"),
		JSON.stringify(evidence, null, 2) + "\n");
	console.info("TL_U18_SECURITY " + JSON.stringify(evidence));
}, 20_000);
