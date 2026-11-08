import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

// Publishing is deliberately a separate, reviewed change.
assert.equal(manifest.private, true, "Release is not authorized");
assert.equal(manifest.version, "0.0.0", "Version bump requires review");
assert.equal(manifest.license, "UNLICENSED", "License choice requires review");

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
