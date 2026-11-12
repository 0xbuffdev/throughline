import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

// Version is validated against the signed Git tag by the release workflow.
assert.equal(manifest.name, "@0xbuff/throughline");
assert.match(manifest.version, /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/, "Invalid stable SemVer version");
assert.equal(manifest.homepage, "https://docs.0xbuff.com/docs/throughline");
assert.equal(manifest.private, false, "Public package must not be marked private");
assert.equal(manifest.publishConfig?.access, "public", "Scoped npm package must publish publicly");
assert.equal(manifest.license, "Apache-2.0", "License must match approved choice");
for (const file of ["README.md", "CHANGELOG.md", "LICENSE", "COPYRIGHT.md"]) {
	assert(
		manifest.files.includes(file),
		"Public package must ship " + file,
	);
}
for (const file of [
	"CONTRIBUTING.md",
	"CODE_OF_CONDUCT.md",
	"SECURITY.md",
]) {
	const contents = readFileSync(join(root, file), "utf8");
	assert(contents.length >= 300, "Incomplete community file: " + file);
}
const attribution = readFileSync(join(root, "COPYRIGHT.md"), "utf8");
assert.match(
	attribution,
	/Copyright 2026 0xBUFF/,
	"Expected maintainer-designated project attribution is missing",
);
assert(
	manifest.files.includes("COPYRIGHT.md"),
	"Project copyright attribution must ship with npm archive",
);
const licenseText = readFileSync(join(root, "LICENSE"), "utf8");
for (const clause of [
	"Apache License",
	"Version 2.0, January 2004",
	"Grant of Copyright License",
	"Grant of Patent License",
	"END OF TERMS AND CONDITIONS",
	"APPENDIX: How to apply the Apache License to your work.",
]) {
	assert(licenseText.includes(clause), "Missing Apache-2.0 clause: " + clause);
}
assert(
	manifest.files.includes("LICENSE"),
	"Explicitly ship the project license in the npm archive",
);

const paths = execFileSync("git", ["ls-files", "-z"], { cwd: root })
	.toString("utf8")
	.split("\0")
	.filter(Boolean);
assert(paths.length > 0, "No tracked files inspected");

const forbiddenPaths = [
	/(?:^|\/)(?:\.env(?:\..+)?|\.dev\.vars(?:\..+)?|id_rsa|id_ed25519)$/,
	/\.(?:pem|p12|pfx|key)$/,
];
const secretPatterns = [
	/-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/,
	/\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/,
	/\bgithub_pat_[A-Za-z0-9_]{22,}\b/,
	/\bgh[pousr]_[A-Za-z0-9]{36,}\b/,
	/\bnpm_[A-Za-z0-9]{20,}\b/,
];
const publicBoundaryPatterns = [
	/github\.com\/0xbuffdev\/(?:context|internal-context|platform)(?:\/|\.git|\b)/i,
	/@repo\//,
	/\b(?:workspace|catalog):/,
	/\.dev\.vars/,
];
const runtimeNetworkPatterns = [
	/\b(?:fetch|eval)\s*\(/,
	/\bnew\s+(?:Function|WebSocket|EventSource|XMLHttpRequest)\s*\(/,
	/\b(?:navigator\.)?sendBeacon\s*\(/,
	/\b(?:XMLHttpRequest|localStorage|sessionStorage)\b/,
];

function isPublicFacing(path) {
	return (
		path.startsWith("src/") ||
		path.startsWith("docs/") ||
		["README.md", "AGENTS.md", "package.json", "tsdown.config.ts"].includes(path)
	);
}
function isProductionSource(path) {
	return (
		path.startsWith("src/") &&
		!path.includes("/__tests__/") &&
		!path.endsWith(".snap") &&
		!path.endsWith(".test.ts") &&
		!path.endsWith(".test.tsx")
	);
}
let inspected = 0;
for (const path of paths) {
	assert(
		!forbiddenPaths.some((regex) => regex.test(path)),
		"Sensitive filename tracked: " + path,
	);
	if (!/\.(?:mjs|cjs|js|jsx|ts|tsx|css|md|json|yaml|yml|snap)$/.test(path)) {
		continue;
	}
	const contents = readFileSync(join(root, path), "utf8");
	inspected++;
	for (const pattern of secretPatterns) {
		assert(
			!pattern.test(contents),
			"Potential credential in tracked file: " + path,
		);
	}
	if (isPublicFacing(path)) {
		for (const pattern of publicBoundaryPatterns) {
			assert(!pattern.test(contents), "Private reference: " + path);
		}
	}
	if (isProductionSource(path)) {
		for (const pattern of runtimeNetworkPatterns) {
			assert(!pattern.test(contents), "Unexpected network/execution API: " + path);
		}
	}
}

for (const name of ["cn", "react", "react-dom"]) {
	const dependency = JSON.parse(
		readFileSync(join(root, "node_modules", name, "package.json"), "utf8"),
	);
	assert.equal(
		dependency.license,
		"MIT",
		"Unexpected declared license for dependency " + name,
	);
}
console.log(
	"Source boundary guard passed for " + inspected +
		" tracked text files; direct runtime/peer licenses declared MIT.",
);
