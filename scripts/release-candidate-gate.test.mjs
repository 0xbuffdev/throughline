import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { autoChecks,productionChecks,verifyCandidate,verifyProduction,verifyReleaseVersion,
	verifyBrowserEvidence,workloads,qualityNames,requiredCases } from "./release-candidate-gate.mjs";
const ctx={sourceSha:"a".repeat(40),archiveSha256:"b".repeat(64),run:"123",attempt:"1",version:"0.2.0"};
const digest=b=>createHash("sha256").update(b).digest("hex");
const checks=names=>Object.fromEntries(names.map(k=>[k,"pass"]));
const make=()=>({candidate:{schema:2,...ctx,checks:checks(autoChecks),productionEvidence:{chromium:"c".repeat(64),firefox:"d".repeat(64),webkit:"e".repeat(64)},
	qualityEvidence:Object.fromEntries(qualityNames.map(n=>[n,"f".repeat(64)]))},
	review:{sourceSha:ctx.sourceSha,archiveSha256:ctx.archiveSha256,reviewer:"QA operator",date:"2025-01-01T00:00:00Z",
		...Object.fromEntries(["u29","manualAT","nativeZoom","licenseNotice","releaseApproval"].map(k=>[k,{status:"pass",evidence:"https://github.com/example-owner/example-repo/issues/1"}]))}});
test("explicit complete review is accepted structurally, not certified as true",()=>{const {candidate,review}=make();verifyCandidate(candidate,ctx,review)});
test("prepare only permits the approved initial version and tag",()=>{
	verifyReleaseVersion("0.2.0","v0.2.0");
	for(const [version,tag] of [["0.1.0","v0.1.0"],["0.2.1","v0.2.1"],["0.2.0","v0.1.0"]])
		assert.throws(()=>verifyReleaseVersion(version,tag));
});
test("authorize rejects internally consistent intermediate version",()=>{
	const {candidate,review}=make();candidate.version="0.1.0";
	assert.throws(()=>verifyCandidate(candidate,{...ctx,version:"0.1.0"},review));
});
for(const [name,change] of Object.entries({
	missingBrowser:c=>{delete c.checks.webkit}, missingProduction:c=>{delete c.checks.productionMermaidChromium},
	missingProductionDigest:c=>{delete c.productionEvidence.firefox}, staleSource:c=>{c.sourceSha="f".repeat(40)},
	staleArchive:c=>{c.archiveSha256="f".repeat(64)}, wrongAttempt:c=>{c.attempt="2"},
	missingQualityDigest:c=>{delete c.qualityEvidence["v2-security.json"]},
	missingAT:(c,r)=>{delete r.manualAT}, notPerformed:(c,r)=>{r.manualAT.status="not performed"},
	missingZoom:(c,r)=>{delete r.nativeZoom}, missingNotice:(c,r)=>{delete r.licenseNotice},
	wrongReviewHash:(c,r)=>{r.archiveSha256="f".repeat(64)}, missingApproval:(c,r)=>{delete r.releaseApproval},
	badLink:(c,r)=>{r.u29.evidence="javascript:alert(1)"}, exampleLink:(c,r)=>{r.u29.evidence="https://example.com/record"}, invalidDate:(c,r)=>{r.date="2025-02-30T00:00:00Z"}, extraCheck:c=>{c.checks.extra="pass"},
})) test("reject "+name,()=>{const {candidate,review}=make();change(candidate,review);assert.throws(()=>verifyCandidate(candidate,ctx,review))});

const timing=()=>({samples:3,minMs:1,medianMs:2,p95Ms:3,maxMs:3});
function production() {
	const files=new Map(), browser="firefox";
	const identity={sourceSha:ctx.sourceSha,archiveSha256:ctx.archiveSha256,run:ctx.run,attempt:ctx.attempt,browser};
	const recordChecks=Object.fromEntries(productionChecks.map(check=>{
		const bytes=Buffer.from(JSON.stringify({schema:1,...identity,check,
			cases:(requiredCases[check]??["test-case"]).map(id=>({id,fixture:"synthetic schema test",expected:"expected result",observed:"actual fixture result",status:"pass"}))}));
		files.set("production-mermaid-"+browser+"-"+check+".json",bytes);
		return [check,{status:"pass",sha256:digest(bytes)}];
	}));
	const inventory=Buffer.from(JSON.stringify({packages:[{name:"synthetic-dependency",version:"1.0.0"}]}));
	files.set("production-mermaid-"+browser+"-dependencies.json",inventory);
	const report={schema:2,...identity,renderer:"production-public-package",status:"pass",checks:recordChecks,
		measurements:{assets:{archiveBytes:1000,initialBytes:200,initialGzipBytes:100,lazyBytes:100,lazyGzipBytes:50},
			workloads:Object.fromEntries(workloads.map(w=>[w,{fixtureSha256:"e".repeat(64),baselineRender:timing(),
				candidateRender:timing(),peakProcessMemoryBytes:10000,memorySamples:3,outcome:"rendered"}])),
			memoryMethod:"sampled process RSS",environment:"synthetic test environment",dependencyTreeSha256:digest(inventory),
			limits:{maxGraphNodes:200,maxGraphEdges:1000,maxSequenceRows:120,degradationPolicy:"bounded fallback"}}};
	const read=name=>{assert(files.has(name),"missing "+name);return files.get(name)};
	return {report,files,read};
}
test("production report and all retained case records complete",()=>{
	const {report,read}=production();verifyProduction(report,{...ctx,archiveBytes:1000},"firefox",read);
});
for(const [name,change] of Object.entries({
	nativeOnly:p=>{p.renderer="native"}, copiedAdapter:p=>{p.renderer="preview"}, wrongEngine:p=>{p.browser="chromium"},
	missingSourceSelection:p=>{delete p.checks.exactSourceSelection}, staleArchive:p=>{p.archiveSha256="a".repeat(64)},
	broadPassLabels:p=>{p.checks=checks(productionChecks)}, missingGeometry:p=>{delete p.checks.stableSeekGeometry},
	missingPaging:p=>{delete p.checks.boundedSequencePaging}, missingState:p=>{delete p.checks.nativeStateEquivalence},
	missingMotion:p=>{delete p.checks.reducedMotionCancellation}, missingAssets:p=>{delete p.measurements.assets.lazyGzipBytes},
	missingMemory:p=>{delete p.measurements.workloads.checkout.peakProcessMemoryBytes},
	missingWorkload:p=>{delete p.measurements.workloads.largeSequence},
	malformedTiming:p=>{p.measurements.workloads.matrix.candidateRender.maxMs=null},
	wrongArchiveBytes:p=>{p.measurements.assets.archiveBytes++},
	missingEvidence:(p,f)=>{f.delete("production-mermaid-firefox-stableSeekGeometry.json")},
	changedEvidence:(p,f)=>{f.set("production-mermaid-firefox-stableSeekGeometry.json",Buffer.from("{}"))},
	missingInventory:(p,f)=>{f.delete("production-mermaid-firefox-dependencies.json")},
	incompleteCaseRecord:(p,f)=>{
		const path="production-mermaid-firefox-stableSeekGeometry.json";
		const rec=JSON.parse(f.get(path));rec.cases.pop();
		const bytes=Buffer.from(JSON.stringify(rec));f.set(path,bytes);
		p.checks.stableSeekGeometry.sha256=digest(bytes);
	},
})) test("reject "+name,()=>{const {report,files,read}=production();change(report,files);
	assert.throws(()=>verifyProduction(report,{...ctx,archiveBytes:1000},"firefox",read))});

function browserReport() {return {ticket:"TL-U18",status:"pass",scope:"automated browser regressions only",
	browser:"firefox",sourceCommit:ctx.sourceSha,workflowRun:ctx.run,workflowAttempt:ctx.attempt,workflowJob:"verify",
	testCommand:"pnpm test:browser:run",includes:["automated controls"],notEstablished:["human speech"],
	runner:{node:"v24.0.0",os:"linux",osRelease:"test",arch:"x64",cpu:"test"}};}
test("browser evidence binds exact run and attempt",()=>verifyBrowserEvidence(browserReport(),ctx,"firefox"));
for(const [name,change] of Object.entries({
	wrongBrowserAttempt:r=>{r.workflowAttempt="2"},missingBrowserAttempt:r=>{delete r.workflowAttempt},
	wrongBrowserRun:r=>{r.workflowRun="124"},wrongBrowserSource:r=>{r.sourceCommit="f".repeat(40)},
})) test("reject "+name,()=>{const report=browserReport();change(report);
	assert.throws(()=>verifyBrowserEvidence(report,ctx,"firefox"))});
