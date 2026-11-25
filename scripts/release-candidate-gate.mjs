/** Release candidate gate. Automated claims are emitted only after successful workflow steps;
 * manual claims remain explicit maintainer attestations, not machine-certified human tests. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { pathToFileURL } from "node:url";

const engines = ["chromium", "firefox", "webkit"];
const autoChecks = ["source","typecheck","preview","compiler","performance","security","licenses",
	"pack","browserHost","frameworks","markdownHosts","chromium","firefox","webkit",
	"productionMermaidChromium","productionMermaidFirefox","productionMermaidWebkit"];
// MR-01–MR-12: individual assertions and separately retained, digest-bound observations.
const productionChecks = [
	"publicGraph","publicSequence","fourReferences","pureRootIsolation","descriptorOwnership",
	"graphTopologyTruth","exactSourceSelection","selectionWithoutPrivateDom","stableSeekGeometry",
	"responsiveGeometry","collapse","presenceTransitions","sequencePhaseTruth","atomicStepOrdering",
	"boundedSequencePaging","completeEvidenceAndTotals","nativeStateEquivalence","fallback",
	"transport","reducedMotionCancellation","motionLifecycle","keyboard","focusAndTextAlternatives",
	"ssrHydration","staleAsyncRender","hostileInputs","offlineNoNetwork","boundedPerformance",
	"pinnedDependencyAndLicenseInventory","baselineComparison",
];
const workloads = ["factorial","matrix","binary","checkout","nearLimitGraph","largeSequence"];
// Required case identities are separate from the producer's observations.
const requiredCases = {
	fourReferences:["factorial","matrix","binary","checkout"],
	pureRootIsolation:["node-only","exports","cli-remark"],
	graphTopologyTruth:["nested-groups","parallel-edges","self-relations","disconnected"],
	stableSeekGeometry:["unchanged-topology-forward","unchanged-topology-backward","topology-change"],
	responsiveGeometry:["width-260","width-320","width-375","width-720"],
	collapse:["nested-collapse","removed-member","expand-round-trip"],
	sequencePhaseTruth:["orphan-ack","duplicate-receipt","timeout-write","retry-separate-id","omitted-phases","no-future-evidence"],
	atomicStepOrdering:["receive-before-send"],
	boundedSequencePaging:["near-limit-history","earlier-later","mounted-bound"],
	completeEvidenceAndTotals:["phase-counts","all-source-ids"],
	nativeStateEquivalence:["known","unknown","absent","null","nested","write","presence"],
	fallback:["unsupported-view","render-failure","oversized"],
	transport:["forward","backward","same-frame-seek","pause","speed","view-switch"],
	reducedMotionCancellation:["reduced-motion","no-autonomous-loop"],
	motionLifecycle:["seek","trace-replacement","unmount"],
	ssrHydration:["server-import","hydrate","packed-public-entry"],
	hostileInputs:["quotes","delimiters","directives","html","links"],
	boundedPerformance:["graph-near-limit","sequence-near-limit","measured-degradation"],
	pinnedDependencyAndLicenseInventory:["source-lock","consumer-tree","license-notices"],
	baselineComparison:workloads,
};
const qualityNames = ["v2-performance.json","v2-security.json",...engines.map(b=>"v2-browser-"+b+".json")];
export function verifyReleaseVersion(version, tag) {
	assert.equal(version,"0.2.0","Only the approved initial schema-2 version is authorized; later releases require reviewed policy");
	assert.equal(tag,"v0.2.0","Only the approved initial schema-2 tag is authorized");
}
const exact = (obj, keys) => {
	assert(obj && typeof obj === "object" && !Array.isArray(obj));
	assert.deepEqual(Object.keys(obj).sort(), [...keys].sort());
};
const passes = (obj, names) => {
	exact(obj,names); for (const key of names) assert.equal(obj[key],"pass",key);
};
const hex = (v,n) => assert(typeof v === "string" && v.length === n && /^[0-9a-f]+$/.test(v));
const id = v => assert(typeof v === "string" && /^[1-9][0-9]*$/.test(v));
const digest = b => createHash("sha256").update(b).digest("hex");
const nonblank = v => assert(typeof v === "string" && v.trim() && !/not performed|not assessed|not verified|pending|placeholder/i.test(v));
const link = v => {
	nonblank(v); const url = new URL(v);
	assert.equal(url.protocol,"https:"); assert(!url.username && !url.password);
	assert(!["example.com","example.org","example.net","localhost"].includes(url.hostname),"Evidence URL must not be an example");
};
export { autoChecks, productionChecks, workloads, qualityNames, requiredCases };
const number = (v,min=0) => assert(typeof v==="number" && Number.isFinite(v) && v>=min);
const count = (v,min=0) => assert(Number.isSafeInteger(v) && v>=min);
function timing(t) {
	exact(t,["samples","minMs","medianMs","p95Ms","maxMs"]);
	count(t.samples,3);
	const values=[t.minMs,t.medianMs,t.p95Ms,t.maxMs];
	for(const [i,v] of values.entries()) { number(v); if(i) assert(v>=values[i-1]); }
}
export function verifyMeasurements(m) {
	exact(m,["assets","workloads","memoryMethod","environment","limits","dependencyTreeSha256"]);
	exact(m.assets,["archiveBytes","initialBytes","initialGzipBytes","lazyBytes","lazyGzipBytes"]);
	for(const k of Object.keys(m.assets)) count(m.assets[k],k==="archiveBytes"||k==="initialBytes"||k==="initialGzipBytes"?1:0);
	assert(m.assets.initialGzipBytes<=m.assets.initialBytes && m.assets.lazyGzipBytes<=m.assets.lazyBytes);
	hex(m.dependencyTreeSha256,64);
	nonblank(m.memoryMethod); nonblank(m.environment);
	exact(m.limits,["maxGraphNodes","maxGraphEdges","maxSequenceRows","degradationPolicy"]);
	for(const k of ["maxGraphNodes","maxGraphEdges","maxSequenceRows"]) count(m.limits[k],1);
	nonblank(m.limits.degradationPolicy);
	exact(m.workloads,workloads);
	for(const key of workloads) {
		const w=m.workloads[key];
		exact(w,["fixtureSha256","baselineRender","candidateRender","peakProcessMemoryBytes","memorySamples","outcome"]);
		hex(w.fixtureSha256,64); timing(w.baselineRender); timing(w.candidateRender);
		count(w.peakProcessMemoryBytes,1); count(w.memorySamples,3);
		assert(["rendered","bounded-fallback"].includes(w.outcome));
		if(!["nearLimitGraph","largeSequence"].includes(key)) assert.equal(w.outcome,"rendered");
	}
}
export function verifyProduction(report, ctx, browser, readEvidence) {
	exact(report,["schema","sourceSha","archiveSha256","run","attempt","browser","renderer","status","checks","measurements"]);
	assert.equal(report.schema,2);
	for (const key of ["sourceSha","archiveSha256","run","attempt"]) assert.equal(report[key],ctx[key]);
	assert.equal(report.browser,browser);
	assert.equal(report.renderer,"production-public-package");
	assert.equal(report.status,"pass");
	exact(report.checks,productionChecks);
	assert(typeof readEvidence==="function","Retained evidence reader required");
	for(const key of productionChecks) {
		const check=report.checks[key];
		exact(check,["status","sha256"]);
		assert.equal(check.status,"pass",key);
		hex(check.sha256,64);
		const bytes=readEvidence("production-mermaid-"+browser+"-"+key+".json");
		assert.equal(digest(bytes),check.sha256,"Missing or changed evidence: "+key);
		const record=JSON.parse(bytes);
		exact(record,["schema","sourceSha","archiveSha256","run","attempt","browser","check","cases"]);
		assert.equal(record.schema,1);
		for(const field of ["sourceSha","archiveSha256","run","attempt"]) assert.equal(record[field],ctx[field]);
		assert.equal(record.browser,browser); assert.equal(record.check,key);
		assert(Array.isArray(record.cases)&&record.cases.length>0);
		const ids=new Set();
		for(const item of record.cases) {
			exact(item,["id","fixture","expected","observed","status"]);
			for(const field of ["id","fixture","expected","observed"]) nonblank(item[field]);
			assert(!ids.has(item.id),"Duplicate case"); ids.add(item.id);
			assert.equal(item.status,"pass");
		}
		for(const required of requiredCases[key]??[]) assert(ids.has(required),"Missing required case: "+key+"/"+required);
	}
	verifyMeasurements(report.measurements);
	if(ctx.archiveBytes!==undefined) assert.equal(report.measurements.assets.archiveBytes,ctx.archiveBytes);
	const tree=readEvidence("production-mermaid-"+browser+"-dependencies.json");
	assert.equal(digest(tree),report.measurements.dependencyTreeSha256,"Missing or changed dependency inventory");
	const inventory=JSON.parse(tree);
	assert(inventory && typeof inventory==="object" && Object.keys(inventory).length>0,"Empty dependency inventory");
}
export function verifyBrowserEvidence(report, ctx, browser) {
	exact(report,["ticket","status","scope","browser","sourceCommit","workflowRun","workflowAttempt",
		"workflowJob","testCommand","includes","notEstablished","runner"]);
	assert.equal(report.ticket,"TL-U18"); assert.equal(report.status,"pass");
	assert.equal(report.scope,"automated browser regressions only");
	assert.equal(report.browser,browser); assert.equal(report.sourceCommit,ctx.sourceSha);
	assert.equal(report.workflowRun,ctx.run); assert.equal(report.workflowAttempt,ctx.attempt);
	assert.equal(report.testCommand,"pnpm test:browser:run");
	nonblank(report.workflowJob);
	for(const key of ["includes","notEstablished"]) {
		assert(Array.isArray(report[key])&&report[key].length>0);
		for(const value of report[key]) nonblank(value);
	}
	exact(report.runner,["node","os","osRelease","arch","cpu"]);
	assert.match(report.runner.node,/^v24\./);
	for(const key of ["os","osRelease","arch","cpu"]) nonblank(report.runner[key]);
}
function qualityEvidence(folder, ctx) {
	// Re-run the strict verifier using the prior attempt's identity, not this dispatch's identity.
	execFileSync(process.execPath,[fileURLToPath(new URL("./verify-release-evidence.mjs",import.meta.url))],{
		stdio:"inherit",env:{...process.env,THL_SOURCE_SHA:ctx.sourceSha,GITHUB_RUN_ID:ctx.run,GITHUB_RUN_ATTEMPT:ctx.attempt},
	});
	for(const browser of engines) verifyBrowserEvidence(readJson(folder+"/v2-browser-"+browser+".json"),ctx,browser);
	return Object.fromEntries(qualityNames.map(name=>[name,digest(readFileSync(folder+"/"+name))]));
}
export function verifyCandidate(candidate, ctx, review) {
	exact(candidate,["schema","sourceSha","archiveSha256","run","attempt","version","checks","productionEvidence","qualityEvidence"]);
	assert.equal(candidate.schema,2);
	verifyReleaseVersion(ctx.version,"v"+ctx.version);
	hex(ctx.sourceSha,40); hex(ctx.archiveSha256,64); id(ctx.run); id(ctx.attempt);
	for (const key of ["sourceSha","archiveSha256","run","attempt","version"]) assert.equal(candidate[key],ctx[key],key);
	passes(candidate.checks,autoChecks);
	exact(candidate.productionEvidence,engines);
	for (const browser of engines) hex(candidate.productionEvidence[browser],64);
	exact(candidate.qualityEvidence,qualityNames);
	for(const name of qualityNames) hex(candidate.qualityEvidence[name],64);
	exact(review,["sourceSha","archiveSha256","reviewer","date","u29","manualAT","nativeZoom","licenseNotice","releaseApproval"]);
	assert.equal(review.sourceSha,ctx.sourceSha);
	assert.equal(review.archiveSha256,ctx.archiveSha256);
	nonblank(review.reviewer);
	assert(typeof review.date==="string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(review.date));
	assert(Number.isFinite(Date.parse(review.date)) && Date.parse(review.date)<=Date.now());
	assert.equal(new Date(review.date).toISOString(),review.date.replace("Z",".000Z"),"Review date must be a real UTC timestamp");
	for (const key of ["u29","manualAT","nativeZoom","licenseNotice","releaseApproval"]) {
		exact(review[key],["status","evidence"]);
		assert.equal(review[key].status,"pass",key); link(review[key].evidence);
	}
}
function readJson(path) { return JSON.parse(readFileSync(path,"utf8")); }
function main(mode) {
	const dir="release-artifacts", sourceSha=process.env.GITHUB_SHA;
	const archive=readFileSync(dir+"/throughline.tgz");
	const archiveSha256=digest(archive);
	assert.equal(readFileSync(dir+"/RELEASE_COMMIT","utf8").trim(),sourceSha);
	assert.equal(readFileSync(dir+"/SHA256SUMS","utf8").trim(),archiveSha256+"  throughline.tgz");
	const version=readJson("package.json").version;
	verifyReleaseVersion(version,process.env.RELEASE_TAG);
	const ctx={sourceSha,archiveSha256,version,run:mode==="prepare"?process.env.GITHUB_RUN_ID:process.env.CANDIDATE_RUN,
		attempt:mode==="prepare"?process.env.GITHUB_RUN_ATTEMPT:process.env.CANDIDATE_ATTEMPT};
	hex(sourceSha,40); hex(archiveSha256,64); id(ctx.run); id(ctx.attempt);
	if(mode==="prepare") {
		const productionEvidence={};
		for(const browser of engines) {
			const path=".release-evidence/production-mermaid-"+browser+".json";
			verifyProduction(readJson(path),{...ctx,archiveBytes:archive.length},browser,name=>readFileSync(".release-evidence/"+name));
			productionEvidence[browser]=digest(readFileSync(path));
		}
		const candidate={schema:2,...ctx,checks:Object.fromEntries(autoChecks.map(k=>[k,"pass"])),productionEvidence,
			qualityEvidence:qualityEvidence(".release-evidence",ctx)};
		writeFileSync(dir+"/CANDIDATE.json",JSON.stringify(candidate,null,2)+"\n");
		appendFileSync(process.env.GITHUB_STEP_SUMMARY,"### Prepared candidate (not staged)\nSource: "+sourceSha+"\n\nArchive SHA-256: "+archiveSha256+"\n");
	} else if(mode==="authorize") {
		assert.equal(process.env.RELEASE_TAG,"v"+version);
		const review=JSON.parse(process.env.REVIEW_JSON);
		const candidate=readJson(dir+"/CANDIDATE.json");
		verifyCandidate(candidate,ctx,review);
		assert.deepEqual(qualityEvidence(".release-evidence",ctx),candidate.qualityEvidence,"Changed quality evidence");
		const completed=Date.parse(process.env.PREPARE_COMPLETED_AT);
		assert(Number.isFinite(completed) && Date.parse(review.date)>=completed,"Review predates candidate completion");
		for (const browser of engines) {
			const path="candidate-proof/production-mermaid-"+browser+".json";
			verifyProduction(readJson(path),{...ctx,archiveBytes:archive.length},browser,name=>readFileSync("candidate-proof/"+name));
			assert.equal(digest(readFileSync(path)),candidate.productionEvidence[browser],"Changed production evidence");
		}
		appendFileSync(process.env.GITHUB_OUTPUT,"archive_sha="+archiveSha256+"\n");
		// JSON text in a code block; avoid rendering untrusted Markdown/HTML or fence injection.
		appendFileSync(process.env.GITHUB_STEP_SUMMARY,"### Candidate awaiting protected environment approval\n\nSource: "+sourceSha+
			"\n\nArchive SHA-256: "+archiveSha256+"\n\nReview attestation (reviewer must independently inspect linked records):\n\n"+
			JSON.stringify(review,null,2).split("\n").map(line=>"    "+line).join("\n")+"\n");
	} else throw new Error("Expected prepare or authorize");
}
if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href) main(process.argv[2]);
