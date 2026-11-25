/**
 * TL-U18 read-only evidence validation. Never creates pass records:
 * the two Vitest suites produce their own data only after assertions pass.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";

const base = join(process.cwd(), ".release-evidence");
const read = name => JSON.parse(readFileSync(join(base, name), "utf8"));
const perf = read("v2-performance.json");
const security = read("v2-security.json");
const expectedHead = process.env.THL_SOURCE_SHA;
assert(expectedHead && /^[0-9a-f]{40}$/.test(expectedHead),
	"CI must supply the exact pull-request head or signed-tag source SHA");
const exact = (obj, keys) => {
	assert(obj && typeof obj === "object" && !Array.isArray(obj));
	assert.deepEqual(Object.keys(obj).sort(), keys.split(" ").sort());
};
const timing = (t, samples) => {
	exact(t, "samples minMs medianMs p95Ms maxMs");
	assert.equal(t.samples, samples);
	const values = [t.minMs, t.medianMs, t.p95Ms, t.maxMs];
	assert(values.every((v, i) => Number.isFinite(v) && v >= 0 && (i === 0 || v >= values[i - 1])));
};
const canonical = v => v === null || typeof v !== "object" ? JSON.stringify(v)
	: Array.isArray(v) ? "[" + v.map(canonical).join(",") + "]"
	: "{" + Object.keys(v).sort().map(k => JSON.stringify(k) + ":" + canonical(v[k])).join(",") + "}";
const scales = [["small",8,12,2,12,2,7],["moderate",64,160,8,240,3,5],["near-limit",180,800,12,1500,4,3]];
function fixtureIdentity([name, entities, relations, groups, steps, eventsPerStep]) {
	const list = Array.from({length: entities}, (_, i) => ({id: "entity"+i, label: "Service "+i, groupId: "group"+(i%groups)}));
	const artifact = {schemaVersion: 2, id: "release"+name.replace("-",""), title: "Deterministic synthetic "+name+" release workload",
		origins: [{id:"synthetic",kind:"simulated",description:"Deterministic benchmark fixture; not production telemetry"}],
		groups: Array.from({length:groups},(_,i)=>({id:"group"+i,label:"Group "+i})), entities:list,
		relations: Array.from({length:relations},(_,i)=>({id:"relation"+i,from:"entity"+(i%entities),to:"entity"+((i*17+1)%entities)})),
		initialState:Object.fromEntries(list.map(e=>[e.id,{status:"known",value:{counter:0,scope:"synthetic"}}])),
		steps:Array.from({length:steps},(_,s)=>({id:"step"+s,label:"Synthetic step "+s,
			events:Array.from({length:eventsPerStep},(_,e)=>({id:"event"+s+"_"+e,type:"write",originId:"synthetic",
				entityId:"entity"+((s*eventsPerStep+e)%entities),path:["counter"],value:{status:"known",value:s+1}}))}))};
	return {entities,relations,groups,steps,events:steps*eventsPerStep,schemaVersion:2,sha256:createHash("sha256").update(canonical(artifact)).digest("hex")};
}
assert.match(process.env.GITHUB_RUN_ID ?? "", /^[1-9][0-9]*$/);
assert.match(process.env.GITHUB_RUN_ATTEMPT ?? "", /^[1-9][0-9]*$/);
exact(perf, "ticket status timingPolicy correctnessPolicy procedure source budgets workloads");
exact(perf.source, "commit workflowRun workflowAttempt npmPackageVersion packageManager node v8 os osRelease architecture cpu logicalCores totalMemoryBytes");
exact(perf.procedure, "warmupCallsPerCase clock p95 fixtureGenerator");
assert.equal(perf.procedure.p95, "nearest rank");
assert.equal(perf.procedure.fixtureGenerator, "src/__tests__/release-v2-performance.test.ts");
assert.equal(perf.correctnessPolicy, "hard schema limits, deterministic replay and geometry checks");
const pkg = JSON.parse(readFileSync("package.json", "utf8"));
assert.equal(perf.source.npmPackageVersion, pkg.version);
assert.equal(perf.source.packageManager, pkg.packageManager);
for (const key of ["v8","os","osRelease","architecture","cpu"]) assert(typeof perf.source[key] === "string" && perf.source[key].trim());
assert(Number.isSafeInteger(perf.source.logicalCores) && perf.source.logicalCores >= 1);
assert(Number.isSafeInteger(perf.source.totalMemoryBytes) && perf.source.totalMemoryBytes > 0);
assert.deepEqual(perf.budgets, {artifactBytes:4194304,validationUnits:1000000,traceUnits:8000000,jsonDepth:32,entities:200,relations:1000,groups:200,steps:2000,events:10000,claims:1000});
exact(security, "ticket gate status seed iterations rejected uniqueHostileInputs uniqueValidBaselines coveredClasses minCasesPerClass variation cases pathRejections uniqueRejectedPaths validBaselineReplayed source workflowRun workflowAttempt note");
assert.equal(security.workflowRun, process.env.GITHUB_RUN_ID);
assert.equal(security.workflowAttempt, process.env.GITHUB_RUN_ATTEMPT, "Security evidence from another attempt");
assert.equal(security.gate, "seeded-malicious-input-sweep");
assert(typeof security.note === "string" && security.note.trim());
exact(security.variation, "distinctDepths minMutatedBytes maxMutatedBytes");
assert(Array.isArray(security.variation.distinctDepths) && security.variation.distinctDepths.every((v,i,a)=>Number.isInteger(v)&&v>=2&&v<=8&&(i===0||v>a[i-1])));
assert(Number.isSafeInteger(security.variation.minMutatedBytes) && security.variation.minMutatedBytes>0);
assert(Number.isSafeInteger(security.variation.maxMutatedBytes));
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
assert.equal(perf.source.workflowAttempt, process.env.GITHUB_RUN_ATTEMPT, "Performance evidence from another attempt");
assert.deepEqual(perf.workloads.map(row => row.scale),
	["small", "moderate", "near-limit"]);
for (const [i, row] of perf.workloads.entries()) {
	const samples = scales[i][6];
	exact(row, "scale fixture checks measurements");
	assert.deepEqual(row.fixture, fixtureIdentity(scales[i]));
	exact(row.checks, "validation deterministicReplay immutableFrames indexedQueries sourceProvenance safeGeometry260And720");
	exact(row.measurements, "compile index query100 projectThreeViews geometry heapDeltaBytes frameCount");
	assert(Number.isSafeInteger(row.measurements.heapDeltaBytes));
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
		timing(timings, samples);
		assert(timings.samples >= 3, key + " needs repeated measured samples");
		assert([timings.minMs, timings.medianMs, timings.p95Ms, timings.maxMs]
			.every(value => Number.isFinite(value) && value >= 0));
		assert(timings.minMs <= timings.medianMs &&
			timings.medianMs <= timings.p95Ms &&
			timings.p95Ms <= timings.maxMs);
	}
	assert.deepEqual(row.measurements.geometry.map(item => item.width), [260, 720]);
	for (const geometry of row.measurements.geometry) {
		exact(geometry, "width layout projectedGeometry nodes sourceRelations edges");
		assert.equal(geometry.nodes, row.fixture.entities + row.fixture.groups);
		timing(geometry.layout, samples);
		timing(geometry.projectedGeometry, samples);
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
