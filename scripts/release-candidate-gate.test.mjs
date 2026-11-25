import assert from "node:assert/strict";
import { test } from "node:test";
import { autoChecks,productionChecks,verifyCandidate,verifyProduction } from "./release-candidate-gate.mjs";
const ctx={sourceSha:"a".repeat(40),archiveSha256:"b".repeat(64),run:"123",attempt:"1",version:"0.2.0"};
const checks=names=>Object.fromEntries(names.map(k=>[k,"pass"]));
const make=()=>({candidate:{schema:1,...ctx,checks:checks(autoChecks),productionEvidence:{chromium:"c".repeat(64),firefox:"d".repeat(64),webkit:"e".repeat(64)}},
	review:{sourceSha:ctx.sourceSha,archiveSha256:ctx.archiveSha256,reviewer:"QA operator",date:"2025-01-01T00:00:00Z",
		...Object.fromEntries(["u29","manualAT","nativeZoom","licenseNotice","releaseApproval"].map(k=>[k,{status:"pass",evidence:"https://github.com/example-owner/example-repo/issues/1"}]))}});
test("explicit complete review is accepted structurally, not certified as true",()=>{const {candidate,review}=make();verifyCandidate(candidate,ctx,review)});
for(const [name,change] of Object.entries({
	missingBrowser:c=>{delete c.checks.webkit}, missingProduction:c=>{delete c.checks.productionMermaidChromium},
	missingProductionDigest:c=>{delete c.productionEvidence.firefox}, staleSource:c=>{c.sourceSha="f".repeat(40)},
	staleArchive:c=>{c.archiveSha256="f".repeat(64)}, wrongAttempt:c=>{c.attempt="2"},
	missingAT:(c,r)=>{delete r.manualAT}, notPerformed:(c,r)=>{r.manualAT.status="not performed"},
	missingZoom:(c,r)=>{delete r.nativeZoom}, missingNotice:(c,r)=>{delete r.licenseNotice},
	wrongReviewHash:(c,r)=>{r.archiveSha256="f".repeat(64)}, missingApproval:(c,r)=>{delete r.releaseApproval},
	badLink:(c,r)=>{r.u29.evidence="javascript:alert(1)"}, exampleLink:(c,r)=>{r.u29.evidence="https://example.com/record"}, invalidDate:(c,r)=>{r.date="2025-02-30T00:00:00Z"}, extraCheck:c=>{c.checks.extra="pass"},
})) test("reject "+name,()=>{const {candidate,review}=make();change(candidate,review);assert.throws(()=>verifyCandidate(candidate,ctx,review))});
const production=()=>({schema:1,sourceSha:ctx.sourceSha,archiveSha256:ctx.archiveSha256,run:ctx.run,attempt:ctx.attempt,browser:"firefox",
	renderer:"production-public-package",status:"pass",checks:checks(productionChecks)});
test("production report complete",()=>verifyProduction(production(),ctx,"firefox"));
for(const [name,change] of Object.entries({
	nativeOnly:p=>{p.renderer="native"}, copiedAdapter:p=>{p.renderer="preview"}, wrongEngine:p=>{p.browser="chromium"},
	missingSourceSelection:p=>{delete p.checks.exactSourceSelection}, staleArchive:p=>{p.archiveSha256="a".repeat(64)},
})) test("reject "+name,()=>{const p=production();change(p);assert.throws(()=>verifyProduction(p,ctx,"firefox"))});
