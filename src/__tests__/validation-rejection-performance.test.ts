import { performance } from "node:perf_hooks";
import { cpus } from "node:os";
import { expect, it } from "vitest";
import { ARTIFACT_LIMITS, ArtifactValidationError, validateArtifact, type VisualArtifact } from "../index.js";

function artifact(value: unknown): VisualArtifact {
	return {
		schemaVersion: 2, id: "boundary", origins: [{ id: "author", kind: "authored" }],
		entities: [{ id: "node", label: "Node" }], relations: [], steps: [],
		initialState: { node: { status: "known", value: value as import("../index.js").JsonValue } },
	};
}

// Measure only the rejection, not construction of the controlled input.
// Heap deltas are observational, not peak memory; GC may make them negative.
it("records hostile object rejection costs and stops before later descriptors", () => {
	const cases: { name: string; make: () => unknown; expected: RegExp }[] = [
		{ name: "oversized-key", make: () => ({ ["é".repeat(2_100_000)]: 0 }), expected: /4 MiB/ },
		{ name: "oversized-collection", make: () => Array(ARTIFACT_LIMITS.validationUnits + 1), expected: /work limit/ },
		{ name: "repeated-object-alias", make: () => {
			const shared = { text: "\u0000".repeat(350_000) };
			return [shared, shared];
		}, expected: /4 MiB/ },
		{ name: "oversized-own-key-list", make: () => Object.fromEntries(
			Array.from({ length: 500_001 }, (_, i) => ["k" + i, 0])), expected: /4 MiB|work limit/ },
	];
	const observations = cases.map(({ name, make, expected }) => {
		const samples = Array.from({ length: 3 }, () => {
			const value = make();
			const input = artifact(value);
			// This enumerable accessor MUST NOT be reached: the oversized
			// earlier value is rejected first, not merely after encoding.
			Object.defineProperty(input, "later", { enumerable: true, get() {
				throw new Error("later getter must not run");
			} });
			const before = process.memoryUsage().heapUsed;
			const start = performance.now();
			let error: unknown;
			try { validateArtifact(input); } catch (caught) { error = caught; }
			const elapsedMs = performance.now() - start;
			const heapDeltaBytes = process.memoryUsage().heapUsed - before;
			expect(error).toBeInstanceOf(ArtifactValidationError);
			expect((error as Error).message).toMatch(expected);
			expect(Number.isFinite(elapsedMs) && elapsedMs >= 0).toBe(true);
			expect(Number.isFinite(heapDeltaBytes)).toBe(true);
			return { elapsedMs, heapDeltaBytes };
		});
		return { name, samples };
	});
	console.info("Hostile object rejection observations (not a timing or heap SLA): " +
		JSON.stringify({ source: process.env.THL_SOURCE_SHA ?? "local", node: process.version,
			cpu: cpus()[0]?.model, observations }));
}, 60_000);
