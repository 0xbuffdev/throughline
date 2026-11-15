/**
 * TL-U18 read-only evidence validation. Never creates pass records:
 * the two Vitest suites produce their own data only after assertions pass.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const base = join(process.cwd(), ".release-evidence");
const read = name => JSON.parse(readFileSync(join(base, name), "utf8"));
const perf = read("v2-performance.json");
const security = read("v2-security.json");
const expectedHead = process.env.THL_SOURCE_SHA;
assert(expectedHead && /^[0-9a-f]{40}$/.test(expectedHead),
	"CI must supply the exact pull-request head or signed-tag source SHA");
assert.equal(perf.source.commit, expectedHead, "Performance evidence from another revision");
assert.equal(security.source, expectedHead, "Security evidence from another revision");
assert.equal(perf.ticket, "TL-U18");
assert.equal(security.ticket, "TL-U18");
assert.equal(perf.status, "pass");
assert.equal(security.status, "pass");
assert.equal(perf.timingPolicy,
	"observational only; no unreviewed absolute CPU/heap SLA");
assert.equal(perf.procedure.warmupCallsPerCase, 1);
assert.equal(perf.procedure.clock, "performance.now (monotonic)");
assert.match(perf.source.node, /^v24\./);
assert(perf.source.cpu && perf.source.logicalCores >= 1);
assert.equal(perf.source.workflowRun, process.env.GITHUB_RUN_ID);
assert.deepEqual(perf.workloads.map(row => row.scale),
	["small", "moderate", "near-limit"]);
for (const row of perf.workloads) {
	assert.equal(row.fixture.schemaVersion, 2);
	assert.match(row.fixture.sha256, /^[0-9a-f]{64}$/);
	assert(row.fixture.entities >= 1 && row.fixture.entities <= perf.budgets.entities);
	assert(row.fixture.relations <= perf.budgets.relations);
	assert(row.fixture.groups <= perf.budgets.groups);
	assert(row.fixture.steps <= perf.budgets.steps);
	assert(row.fixture.events <= perf.budgets.events);
	assert.equal(row.measurements.frameCount, row.fixture.steps + 1);
	for (const result of Object.values(row.checks))
		assert.equal(result, "pass");
	for (const key of ["compile", "index", "query100", "projectThreeViews"]) {
		const timings = row.measurements[key];
		assert(timings.samples >= 3, key + " needs repeated measured samples");
		assert([timings.minMs, timings.medianMs, timings.p95Ms, timings.maxMs]
			.every(value => Number.isFinite(value) && value >= 0));
		assert(timings.minMs <= timings.medianMs &&
			timings.medianMs <= timings.p95Ms &&
			timings.p95Ms <= timings.maxMs);
	}
	assert.deepEqual(row.measurements.geometry.map(item => item.width), [260, 720]);
	for (const geometry of row.measurements.geometry) {
		assert(geometry.nodes >= row.fixture.entities);
		assert.equal(geometry.sourceRelations, row.fixture.relations,
			"All declared source relations must survive graph projection");
		assert.equal(geometry.edges, row.fixture.relations,
			"Every uncollapsed source relation must have one routed edge");
		assert(geometry.layout.samples >= 3);
		assert(geometry.projectedGeometry.samples >= 3);
	}
}
assert.equal(perf.workloads[2].fixture.entities, 180);
assert.equal(perf.workloads[2].fixture.steps, 1500);
assert.equal(perf.workloads[2].fixture.events, 6000);
assert.equal(security.seed, "0x18a2b47d");
assert.equal(security.iterations, 144);
assert.equal(security.rejected, 144);
assert.equal(security.uniqueHostileInputs, 144, "Repeated malformed inputs cannot count as distinct fuzz coverage");
assert.equal(security.uniqueValidBaselines, 144);
const requiredClasses = [
	"legacy-schema", "duplicate-json-key", "trailing-code", "unknown-origin",
	"bad-entity-id", "missing-relation-endpoint", "unrecognized-event",
	"bad-phase", "unknown-cell-vocabulary", "prototype-property",
	"conflicting-same-step-write", "lone-surrogate",
];
assert.deepEqual(Object.keys(security.cases).sort(), [...requiredClasses].sort());
assert.equal(security.coveredClasses, requiredClasses.length);
assert.equal(security.minCasesPerClass, 12);
for (const name of requiredClasses)
	assert.equal(security.cases[name], 12, "Required attack class not exhaustively sampled: " + name);
assert.equal(security.variation.distinctDepths.length >= 3, true);
assert(security.variation.maxMutatedBytes > security.variation.minMutatedBytes);
assert.equal(security.pathRejections, 46);
assert.equal(security.uniqueRejectedPaths, 46);
assert.equal(security.validBaselineReplayed, true);
console.info("TL-U18 accepted release evidence from " + expectedHead +
	": 3 deterministic fixture scales, 4 measured operations, 2 geometry widths, " +
	security.rejected + " rejected hostile inputs.");
