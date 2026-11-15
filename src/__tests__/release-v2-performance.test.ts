import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { arch, cpus, platform, release, totalmem } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { expect, it } from "vitest";
import {
	ARTIFACT_LIMITS, artifactSha256, compileArtifact, inspectTrace,
	projectInspection, projectView, type VisualArtifact,
} from "../index.js";
import { layoutGraph, layoutGraphView } from "../v2/graph-layout.js";

/**
 * TL-U18 measured *v2* baseline. No wall-clock performance SLA is invented:
 * GitHub Actions runner contention makes raw ms numbers unsuitable as a
 * release gate until comparable baselines have been reviewed. Correctness,
 * deterministic results, work ceilings and complete evidence output gate CI.
 */
type Scale = Readonly<{
	name: "small" | "moderate" | "near-limit";
	entities: number;
	relations: number;
	groups: number;
	steps: number;
	eventsPerStep: number;
	iterations: number;
}>;

const SCALES: readonly Scale[] = [
	{ name: "small", entities: 8, relations: 12, groups: 2,
		steps: 12, eventsPerStep: 2, iterations: 7 },
	{ name: "moderate", entities: 64, relations: 160, groups: 8,
		steps: 240, eventsPerStep: 3, iterations: 5 },
	{ name: "near-limit", entities: 180, relations: 800, groups: 12,
		steps: 1_500, eventsPerStep: 4, iterations: 3 },
];

function fixture(size: Scale): VisualArtifact {
	const entities: VisualArtifact["entities"] = Array.from({ length: size.entities },
		(_, i) => ({
			id: "entity" + i,
			label: "Service " + i,
			groupId: "group" + (i % size.groups),
		}));
	return {
		schemaVersion: 2,
		id: "release" + size.name.replace("-", ""),
		title: "Deterministic synthetic " + size.name + " release workload",
		origins: [{ id: "synthetic", kind: "simulated",
			description: "Deterministic benchmark fixture; not production telemetry" }],
		groups: Array.from({ length: size.groups }, (_, i) => ({
			id: "group" + i, label: "Group " + i,
		})),
		entities,
		relations: Array.from({ length: size.relations }, (_, i) => ({
			id: "relation" + i, from: "entity" + (i % size.entities),
			to: "entity" + ((i * 17 + 1) % size.entities),
		})),
		initialState: Object.fromEntries(entities.map(entity => [
			entity.id, { status: "known", value: { counter: 0, scope: "synthetic" } },
		])),
		steps: Array.from({ length: size.steps }, (_, step) => ({
			id: "step" + step, label: "Synthetic step " + step,
			events: Array.from({ length: size.eventsPerStep }, (_, event) => ({
				id: "event" + step + "_" + event,
				type: "write" as const, originId: "synthetic",
				entityId: "entity" + ((step * size.eventsPerStep + event) % size.entities),
				path: ["counter"],
				value: { status: "known" as const, value: step + 1 },
			})),
		})),
	};
}

function sample<T>(runs: number, work: () => T): { times: number[]; result: T } {
	// Each operation is warmed before timed samples. Timing is monotonic, never
	// used to decide whether a correct scenario passes release verification.
	const warm = work();
	void warm;
	let result!: T;
	const times: number[] = [];
	for (let i = 0; i < runs; i++) {
		const start = performance.now();
		result = work();
		times.push(performance.now() - start);
	}
	return { times, result };
}

function stats(values: readonly number[]) {
	const sorted = [...values].sort((a, b) => a - b);
	const nearest = (fraction: number) =>
		Number(sorted[Math.ceil(fraction * sorted.length) - 1].toFixed(3));
	return {
		samples: sorted.length,
		minMs: Number(sorted[0].toFixed(3)),
		medianMs: nearest(0.5),
		p95Ms: nearest(0.95),
		maxMs: Number(sorted[sorted.length - 1].toFixed(3)),
	};
}

it("TL-U18 emits a reproducible small/moderate/near-limit v2 performance matrix with correctness gates", () => {
	const packageJson = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")) as {
		version: string; packageManager: string;
	};
	const rows = [];
	for (const size of SCALES) {
		expect(size.entities).toBeLessThanOrEqual(ARTIFACT_LIMITS.entities);
		expect(size.relations).toBeLessThanOrEqual(ARTIFACT_LIMITS.relations);
		expect(size.groups).toBeLessThanOrEqual(ARTIFACT_LIMITS.groups);
		expect(size.steps).toBeLessThanOrEqual(ARTIFACT_LIMITS.steps);
		expect(size.steps * size.eventsPerStep).toBeLessThanOrEqual(ARTIFACT_LIMITS.events);
		const authored = fixture(size);
		const fixtureHash = artifactSha256(authored);
		const original = fixtureHash;
		const beforeHeap = process.memoryUsage().heapUsed;

		const compilation = sample(size.iterations, () => compileArtifact(authored));
		const trace = compilation.result;
		expect(trace.frames).toHaveLength(size.steps + 1);
		expect(trace.artifact.schemaVersion).toBe(2);
		expect(trace.frames.at(-1)?.id).toBe("step" + (size.steps - 1));
		expect(artifactSha256(trace.artifact)).toBe(fixtureHash);
		expect(artifactSha256(authored)).toBe(original);
		expect(Object.isFrozen(trace.frames[0])).toBe(true);
		expect(Object.isFrozen(trace.frames.at(-1)!)).toBe(true);

		const index = sample(size.iterations, () => inspectTrace(trace));
		const inspector = index.result;
		expect(inspector.frameCount).toBe(size.steps + 1);
		const last = size.steps;
		const queries = sample(size.iterations, () => {
			const values = [];
			for (let i = 0; i < 100; i++) {
				const frameIndex = (i * 997) % (last + 1);
				const id = "entity" + ((i * 13) % size.entities);
				values.push(inspector.valueAt(frameIndex, id, ["counter"]));
				inspector.diff(Math.max(0, frameIndex - 1), frameIndex);
			}
			return values;
		});
		expect(queries.result).toHaveLength(100);
		expect(queries.result.every(cell => cell.status === "known")).toBe(true);
		expect(inspector.history("entity0").every(change =>
			change.eventId.startsWith("event"))).toBe(true);

		const projections = sample(size.iterations, () => ({
			graph: projectView(inspector, { kind: "graph", frameIndex: last }),
			table: projectView(inspector, { kind: "state-table", frameIndex: last }),
			explain: projectInspection(inspector, { frameIndex: last }),
		}));
		expect(projections.result.graph.kind).toBe("graph");
		expect(projections.result.table.kind).toBe("state-table");
		expect(projections.result.graph.frameId).toBe("step" + (size.steps - 1));
		expect(projections.result.table.items.some(item =>
			item.source.entityIds?.includes("entity0"))).toBe(true);
		for (const item of projections.result.graph.items) {
			const source = item.source;
			expect((source.entityIds?.length ?? 0) + (source.relationIds?.length ?? 0) +
				(source.groupIds?.length ?? 0) + (source.eventIds?.length ?? 0))
				.toBeGreaterThan(0);
		}

		const geom = [];
		for (const width of [260, 720]) {
			const layout = sample(size.iterations, () => layoutGraph(trace, width));
			const measured = layout.result;
			expect(measured.width).toBe(width);
			expect(measured.height).toBeGreaterThan(0);
			expect(Object.keys(measured.nodes)).toHaveLength(size.entities + size.groups);
			for (const box of Object.values(measured.nodes)) {
				expect([box.x, box.y, box.w, box.h].every(Number.isFinite)).toBe(true);
				expect(box.x).toBeGreaterThanOrEqual(0);
				expect(box.y).toBeGreaterThanOrEqual(0);
				expect(box.x + box.w).toBeLessThanOrEqual(measured.width);
				expect(box.y + box.h).toBeLessThanOrEqual(measured.height);
			}
			const projected = sample(size.iterations, () =>
				layoutGraphView(measured, projections.result.graph));
			expect(Object.values(projected.result.edges).every(edge =>
				[...edge.from, ...edge.to, ...edge.label, edge.angle].every(Number.isFinite))).toBe(true);
			geom.push({ width, layout: stats(layout.times), projectedGeometry: stats(projected.times),
				nodes: Object.keys(measured.nodes).length,
				edges: Object.keys(projected.result.edges).length });
		}
		// A determinism check uses *data*, never elapsed time, for the gate.
		const mirror = inspectTrace(compileArtifact(authored));
		const matching = projectView(mirror, { kind: "state-table", frameIndex: last });
		expect(matching).toEqual(projections.result.table);
		expect(inspector.stateAt(0)).toEqual(mirror.stateAt(0));
		expect(inspector.stateAt(last)).toEqual(mirror.stateAt(last));

		rows.push({
			scale: size.name,
			fixture: {
				entities: size.entities, relations: size.relations,
				groups: size.groups, steps: size.steps,
				events: size.steps * size.eventsPerStep,
				schemaVersion: 2, sha256: fixtureHash,
			},
			checks: {
				validation: "pass", deterministicReplay: "pass",
				immutableFrames: "pass", indexedQueries: "pass",
				sourceProvenance: "pass", safeGeometry260And720: "pass",
			},
			measurements: {
				compile: stats(compilation.times),
				index: stats(index.times),
				query100: stats(queries.times),
				projectThreeViews: stats(projections.times),
				geometry: geom,
				heapDeltaBytes: process.memoryUsage().heapUsed - beforeHeap,
				frameCount: trace.frames.length,
			},
		});
	}

	const evidence = {
		ticket: "TL-U18",
		status: "pass",
		timingPolicy: "observational only; no unreviewed absolute CPU/heap SLA",
		correctnessPolicy: "hard schema limits, deterministic replay and geometry checks",
		procedure: {
			warmupCallsPerCase: 1,
			clock: "performance.now (monotonic)",
			p95: "nearest rank",
			fixtureGenerator: "src/__tests__/release-v2-performance.test.ts",
		},
		source: {
			commit: process.env.THL_SOURCE_SHA ?? process.env.GITHUB_SHA ?? "local-unverified",
			workflowRun: process.env.GITHUB_RUN_ID ?? "local",
			npmPackageVersion: packageJson.version, packageManager: packageJson.packageManager,
			node: process.version, v8: process.versions.v8,
			os: platform(), osRelease: release(), architecture: arch(),
			cpu: cpus()[0]?.model ?? "unknown", logicalCores: cpus().length,
			totalMemoryBytes: totalmem(),
		},
		budgets: ARTIFACT_LIMITS,
		workloads: rows,
	};
	const location = join(process.cwd(), ".release-evidence");
	mkdirSync(location, { recursive: true });
	writeFileSync(join(location, "v2-performance.json"),
		JSON.stringify(evidence, null, 2) + "\n", "utf8");
	console.info("TL_U18_PERFORMANCE " + JSON.stringify(evidence));
	expect(rows.map(row => row.scale))
		.toEqual(["small", "moderate", "near-limit"]);
}, 120_000);
