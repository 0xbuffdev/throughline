/** Release candidate gate. Automated claims are emitted only after successful workflow steps;
 * manual claims remain explicit maintainer attestations, not machine-certified human tests. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const engines = ["chromium", "firefox", "webkit"];
const autoChecks = ["source","typecheck","preview","compiler","performance","security","licenses",
	"pack","browserHost","frameworks","markdownHosts","chromium","firefox","webkit",
	"productionMermaidChromium","productionMermaidFirefox","productionMermaidWebkit"];
const productionChecks = ["publicGraph","publicSequence","fourReferences","exactSourceSelection",
	"collapse","fallback","transport","keyboard","ssrHydration","hostileInputs","boundedPerformance"];
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
export { autoChecks, productionChecks };
export function verifyProduction(report, ctx, browser) {
	exact(report,["schema","sourceSha","archiveSha256","run","attempt","browser","renderer","status","checks"]);
	assert.equal(report.schema,1);
	for (const key of ["sourceSha","archiveSha256","run","attempt"]) assert.equal(report[key],ctx[key]);
	assert.equal(report.browser,browser);
	assert.equal(report.renderer,"production-public-package");
	assert.equal(report.status,"pass");
	passes(report.checks,productionChecks);
}
export function verifyCandidate(candidate, ctx, review) {
	exact(candidate,["schema","sourceSha","archiveSha256","run","attempt","version","checks","productionEvidence"]);
	assert.equal(candidate.schema,1);
	hex(ctx.sourceSha,40); hex(ctx.archiveSha256,64); id(ctx.run); id(ctx.attempt);
	for (const key of ["sourceSha","archiveSha256","run","attempt","version"]) assert.equal(candidate[key],ctx[key],key);
	passes(candidate.checks,autoChecks);
	exact(candidate.productionEvidence,engines);
	for (const browser of engines) hex(candidate.productionEvidence[browser],64);
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
	const archiveSha256=digest(readFileSync(dir+"/throughline.tgz"));
	assert.equal(readFileSync(dir+"/RELEASE_COMMIT","utf8").trim(),sourceSha);
	assert.equal(readFileSync(dir+"/SHA256SUMS","utf8").trim(),archiveSha256+"  throughline.tgz");
	const version=readJson("package.json").version;
	const ctx={sourceSha,archiveSha256,version,run:mode==="prepare"?process.env.GITHUB_RUN_ID:process.env.CANDIDATE_RUN,
		attempt:mode==="prepare"?process.env.GITHUB_RUN_ATTEMPT:process.env.CANDIDATE_ATTEMPT};
	hex(sourceSha,40); hex(archiveSha256,64); id(ctx.run); id(ctx.attempt);
	if(mode==="prepare") {
		const productionEvidence={};
		for(const browser of engines) {
			const automated=readJson(".release-evidence/v2-browser-"+browser+".json");
			assert.equal(automated.sourceCommit,sourceSha); assert.equal(automated.workflowRun,ctx.run);
			assert.equal(automated.browser,browser); assert.equal(automated.status,"pass");
			const path=".release-evidence/production-mermaid-"+browser+".json";
			verifyProduction(readJson(path),ctx,browser);
			productionEvidence[browser]=digest(readFileSync(path));
		}
		const candidate={schema:1,...ctx,checks:Object.fromEntries(autoChecks.map(k=>[k,"pass"])),productionEvidence};
		writeFileSync(dir+"/CANDIDATE.json",JSON.stringify(candidate,null,2)+"\n");
		appendFileSync(process.env.GITHUB_STEP_SUMMARY,"### Prepared candidate (not staged)\nSource: "+sourceSha+"\n\nArchive SHA-256: "+archiveSha256+"\n");
	} else if(mode==="authorize") {
		assert.equal(process.env.RELEASE_TAG,"v"+version);
		const review=JSON.parse(process.env.REVIEW_JSON);
		const candidate=readJson(dir+"/CANDIDATE.json");
		verifyCandidate(candidate,ctx,review);
		const completed=Date.parse(process.env.PREPARE_COMPLETED_AT);
		assert(Number.isFinite(completed) && Date.parse(review.date)>=completed,"Review predates candidate completion");
		for (const browser of engines) {
			const path="candidate-proof/production-mermaid-"+browser+".json";
			verifyProduction(readJson(path),ctx,browser);
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
