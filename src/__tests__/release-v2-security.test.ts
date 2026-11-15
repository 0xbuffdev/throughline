import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import {
	artifactRelativePath, compileArtifact, parseArtifactJson, projectView,
	inspectTrace, serializeArtifact, type JsonValue, type VisualArtifact,
} from "../index.js";

/**
 * TL-U18 security/property sweep. Every source is constructed from a valid,
 * independently compiled schema-2 input with seeded variation in values,
 * string lengths, JSON depth and paths. The attack table preserves known
 * regressions, while every trial has its own distinct mutated JSON bytes.
 *
 * Deterministic, bounded input generators are not a substitute for fuzzing
 * with arbitrary bytes or a human security audit.
 */
const SEED = 0x18a2b47d;
const TOTAL = 144;
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
function replaceRequired(source: string, from: string, to: string): string {
	expect(source.includes(from), "baseline fixture must contain " + from).toBe(true);
	return source.replace(from, to);
}
const adversaries: readonly {
	name: string;
	mutate: (text: string, token: string) => string;
}[] = [
	{ name: "legacy-schema", mutate: (text, token) =>
		replaceRequired(text, '"schemaVersion":2', '"schemaVersion":' + (3 + token.length)) },
	{ name: "duplicate-json-key", mutate: text =>
		replaceRequired(text, '"schemaVersion":2', '"schemaVersion":2,"schemaVersion":2') },
	{ name: "trailing-code", mutate: (text, token) => text + "\n;notExecutable_" + token },
	{ name: "unknown-origin", mutate: (text, token) =>
		replaceRequired(text, '"originId":"author"', '"originId":"missing' + token + '"') },
	{ name: "bad-entity-id", mutate: (text, token) =>
		replaceRequired(text, '"id":"source"', '"id":"../' + token + '"') },
	{ name: "missing-relation-endpoint", mutate: (text, token) =>
		replaceRequired(text, '"to":"target"', '"to":"nowhere' + token + '"') },
	{ name: "unrecognized-event", mutate: (text, token) =>
		replaceRequired(text, '"type":"message"', '"type":"execute' + token + '"') },
	{ name: "bad-phase", mutate: (text, token) =>
		replaceRequired(text, '"phase":"sent"', '"phase":"persisted' + token + '"') },
	{ name: "unknown-cell-vocabulary", mutate: (text, token) =>
		replaceRequired(text, '"status":"unknown"', '"status":"probably' + token + '"') },
	{ name: "prototype-property", mutate: (text, token) =>
		replaceRequired(text, '"count":0', '"__proto__":' + token.length + ',"count":0') },
	{ name: "conflicting-same-step-write", mutate: (text, token) => {
		const altered = JSON.parse(text) as VisualArtifact;
		altered.steps[1].events.unshift({
			id: "overlap", type: "write", originId: "author", entityId: "source",
			path: ["count"], value: { status: "known", value: token.length },
		});
		return JSON.stringify(altered);
	} },
	{ name: "lone-surrogate", mutate: text =>
		replaceRequired(text, '"label":"Source"', '"label":"\\uD800"') },
];
const sha = (text: string): string =>
	createHash("sha256").update(text).digest("hex");

it("TL-U18 rejects 144 distinct, seeded, class-covered hostile inputs without mutating trusted state", () => {
	const next = rng(SEED);
	const baseline = base();
	const canonical = serializeArtifact(baseline);
	const outcomes: Record<string, number> = Object.create(null);
	const hashes = new Set<string>();
	const cleanHashes = new Set<string>();
	const observedDepths = new Set<number>();
	let minBytes = Infinity;
	let maxBytes = 0;
	for (let iteration = 0; iteration < TOTAL; iteration++) {
		// Round-robin makes every required class mandatory and independently
		// exercised 12 times. PRNG varies the *contents*, not class coverage.
		const chosen = adversaries[iteration % adversaries.length];
		const variant = base();
		const token = (iteration + 1).toString(36) + "_" + next().toString(36);
		const length = 8 + (next() % 152);
		const salt = Array.from({ length }, () =>
			String.fromCharCode(97 + (next() % 26))).join("");
		const depth = 2 + (next() % 7);
		observedDepths.add(depth);
		let nested: JsonValue = { token, salt };
		for (let layer = 0; layer < depth; layer++)
			nested = { branch: nested, level: layer };
		variant.title = "Hostile-input baseline " + token;
		variant.steps[1].label = "Transition " + salt.slice(0, 24);
		variant.initialState.source = {
			status: "known",
			value: { count: 0, status: null, nested, referencePath: "branch/" + salt },
		};
		const clean = serializeArtifact(variant);
		expect(() => compileArtifact(parseArtifactJson(clean))).not.toThrow();
		cleanHashes.add(sha(clean));
		const altered = chosen.mutate(clean, token);
		expect(altered, "mutation " + chosen.name).not.toBe(clean);
		const digest = sha(altered);
		expect(hashes.has(digest), "duplicate hostile source at trial " + iteration).toBe(false);
		hashes.add(digest);
		minBytes = Math.min(minBytes, Buffer.byteLength(altered, "utf8"));
		maxBytes = Math.max(maxBytes, Buffer.byteLength(altered, "utf8"));
		expect(() => compileArtifact(parseArtifactJson(altered)),
			"Attack class " + chosen.name + " trial " + iteration).toThrow();
		outcomes[chosen.name] = (outcomes[chosen.name] ?? 0) + 1;
	}
	expect(hashes.size).toBe(TOTAL);
	expect(cleanHashes.size).toBe(TOTAL);
	expect(observedDepths.size).toBeGreaterThan(2);
	expect(maxBytes).toBeGreaterThan(minBytes);
	expect(Object.keys(outcomes).sort()).toEqual(adversaries.map(c => c.name).sort());
	for (const attack of adversaries)
		expect(outcomes[attack.name]).toBe(TOTAL / adversaries.length);

	const trace = compileArtifact(baseline);
	expect(trace.frames).toHaveLength(3);
	expect(inspectTrace(trace).valueAt(1, "target").status).toBe("unknown");
	expect(projectView(inspectTrace(trace), { frameIndex: 1, kind: "sequence" })
		.items.some(item => item.source.eventIds?.includes("sent"))).toBe(true);
	expect(Object.prototype.hasOwnProperty.call(Object.prototype, "polluted")).toBe(false);
	expect(serializeArtifact(baseline)).toBe(canonical);

	// Historical known-bad locators, plus unique seeded path variation; no
	// path is allowed to escape via traversal or platform-specific separators.
	const invalidPaths = [
		"../outside.json", "/tmp/file", "./artifact.json", "nested/../file",
		"nested//file", "nested\\file", "%2e%2e/file", "nested/%2fsecret",
		"nested/\0secret", "C:/windows/system32",
	];
	for (let iteration = 0; iteration < 36; iteration++) {
		const token = iteration.toString(36) + "_" + next().toString(36);
		invalidPaths.push("../" + token + "/secret.json");
	}
	expect(new Set(invalidPaths).size).toBe(46);
	for (const path of invalidPaths)
		expect(() => artifactRelativePath(path), "unsafe path " + JSON.stringify(path)).toThrow();
	expect(artifactRelativePath("content/docs/model.mdx")).toBe("content/docs/model.mdx");

	const evidence = {
		ticket: "TL-U18", gate: "seeded-malicious-input-sweep",
		status: "pass", seed: "0x" + SEED.toString(16),
		iterations: TOTAL, rejected: TOTAL,
		uniqueHostileInputs: hashes.size,
		uniqueValidBaselines: cleanHashes.size,
		coveredClasses: adversaries.length,
		minCasesPerClass: TOTAL / adversaries.length,
		variation: { distinctDepths: [...observedDepths].sort((a, b) => a - b),
			minMutatedBytes: minBytes, maxMutatedBytes: maxBytes },
		cases: outcomes, pathRejections: invalidPaths.length,
		uniqueRejectedPaths: new Set(invalidPaths).size,
		validBaselineReplayed: true,
		source: process.env.THL_SOURCE_SHA ?? process.env.GITHUB_SHA ?? "local-unverified",
		note: "Distinct seeded mutations of validated inputs; not a formal fuzzing or security audit.",
	};
	mkdirSync(join(process.cwd(), ".release-evidence"), { recursive: true });
	writeFileSync(join(process.cwd(), ".release-evidence", "v2-security.json"),
		JSON.stringify(evidence, null, 2) + "\n");
	console.info("TL_U18_SECURITY " + JSON.stringify(evidence));
}, 20_000);
