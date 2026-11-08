import assert from "node:assert/strict";
import { appendFileSync, readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
assert.equal(pkg.name, "@0xbuff/throughline");
assert.equal(pkg.private, true, "Registry probe is prerelease only");
assert.equal(pkg.version, "0.0.0", "Registry probe is prerelease only");

const response = await fetch(
	"https://registry.npmjs.org/" + encodeURIComponent(pkg.name),
	{
		headers: { Accept: "application/json" },
		redirect: "error",
		signal: AbortSignal.timeout(15_000),
	},
);
let state;
if (response.status === 404) {
	state = "No publicly visible package metadata (HTTP 404).";
} else if (response.status === 200) {
	const meta = await response.json();
	assert.equal(meta.name, pkg.name, "Mismatched package registry response");
	const versions = Object.keys(meta.versions ?? {}).sort();
	state = "Public metadata exists. Versions: " +
		(versions.join(", ") || "(none)") +
		"; dist-tags: " + JSON.stringify(meta["dist-tags"] ?? {}) + ".";
} else {
	throw new Error("Unexpected registry HTTP status " + response.status);
}
const summary = [
	"## Read-only npm package metadata preflight",
	"",
	"Target: " + pkg.name,
	"",
	"Result: " + state,
	"",
	"This unauthenticated GET cannot verify scope ownership, publishing",
	"privileges, private packages, staged package state or authorization.",
	"",
].join("\n");
console.log(summary);
if (process.env.GITHUB_STEP_SUMMARY) {
	appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary, "utf8");
}
