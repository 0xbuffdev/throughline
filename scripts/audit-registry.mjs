/**
 * TL-U19 post-approval registry-only smoke. Must not run in pre-release CI.
 * Installs exactly the approved public version, not a local npm tarball or
 * workspace source, and checks the standalone CLI, all six public exports,
 * React optionality, deterministic reference compilation and npm signatures.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

function run(cmd, args, cwd) {
	const result = spawnSync(cmd, args, {
		cwd, encoding: "utf8", maxBuffer: 8 * 1024 * 1024,
		env: { ...process.env, npm_config_registry: "https://registry.npmjs.org/" },
	});
	assert.equal(result.status, 0, cmd + " " + args.join(" ") +
		"\n" + (result.stderr ?? "") + "\n" + (result.stdout ?? ""));
	return result.stdout;
}
const [manifestArg] = process.argv.slice(2);
assert(manifestArg && process.argv.length === 3,
	"Usage: node scripts/audit-registry.mjs <reviewed-RELEASE_MANIFEST.json>");
const manifestPath = resolve(manifestArg);
const record = JSON.parse(readFileSync(manifestPath, "utf8"));
assert.equal(record.package, "@0xbuff/throughline");
assert.match(record.version, /^\d+\.\d+\.\d+$/);
run(process.execPath, ["scripts/verify-registry-release.mjs", manifestPath], process.cwd());
const scratch = mkdtempSync(join(tmpdir(), "throughline-registry-release-"));
try {
	writeFileSync(join(scratch, "package.json"), JSON.stringify({
		name: "throughline-published-package-audit",
		private: true, type: "module", version: "0.0.0",
	}));
	const npmFlags = ["--ignore-scripts", "--no-fund", "--no-audit",
		"--save-exact", "--omit=peer"];
	run("npm", ["install", ...npmFlags,
		"@0xbuff/throughline@" + record.version], scratch);
	const installed = JSON.parse(readFileSync(join(scratch, "node_modules",
		"@0xbuff", "throughline", "package.json"), "utf8"));
	assert.equal(installed.version, record.version);
	assert.equal(installed.name, record.package);
	assert.equal(existsSync(join(scratch, "node_modules", "react")), false,
		"React must remain optional for pure Node consumers");
	assert.deepEqual(Object.keys(installed.exports).sort(), [
		".", "./examples", "./node", "./react", "./remark",
		"./styles/throughline.css",
	].sort());
	assert(existsSync(join(scratch, "node_modules", ".bin", "thl")),
		"Registry-installed executable thl is missing");
	const cli = join(scratch, "node_modules", "@0xbuff", "throughline", "dist", "cli", "main.js");
	assert.match(run(process.execPath, [cli, "help"], scratch), /thl materialize/);
	run(process.execPath, ["--input-type=module", "-e", [
		'import assert from "node:assert/strict";',
		'import * as core from "@0xbuff/throughline";',
		'import { EXAMPLES } from "@0xbuff/throughline/examples";',
		'import { createNodeThroughlineHost } from "@0xbuff/throughline/node";',
		'import { remarkThroughline } from "@0xbuff/throughline/remark";',
		'assert.equal(typeof core.compileArtifact, "function");',
		'assert.equal(typeof core.inspectTrace, "function");',
		'assert.equal(typeof core.projectInspection, "function");',
		'assert.equal(typeof core.compile, "undefined");',
		'assert.equal(typeof createNodeThroughlineHost, "function");',
		'assert.equal(typeof remarkThroughline, "function");',
		'assert.equal(EXAMPLES.length, 4);',
		'assert(EXAMPLES.every(e => core.compileArtifact(e.artifact).frames.length >= 2));',
	].join("\n")], scratch);
	assert(existsSync(join(scratch, "node_modules", "@0xbuff",
		"throughline", "src", "styles", "throughline.css")));
	// Provenance is cryptographically validated by npm, not by our metadata
	// field checks. Any missing or invalid attestation must stop acceptance.
	run("npm", ["audit", "signatures"], scratch);
	// Optional UI surface: React is a peer, not a required root dependency.
	run("npm", ["install", ...npmFlags, "react@^19.2.7", "react-dom@^19.2.7"], scratch);
	run(process.execPath, ["--input-type=module", "-e", [
		'import assert from "node:assert/strict";',
		'import * as ui from "@0xbuff/throughline/react";',
		'assert.deepEqual(Object.keys(ui).sort(),',
		'  ["ThroughlineGraphPlayer", "ThroughlineEmbed"].sort());',
	].join("\n")], scratch);
	console.log("TL_U19_REGISTRY_CONSUMER " + JSON.stringify({
		ticket: "TL-U19", name: record.package, version: record.version,
		sourceSha: record.sourceSha, expectedStagedSha256: record.sha256,
		passed: [
			"registry archive sha256/sha512/sha1/provenance metadata",
			"installed npm version and public export map",
			"Node-only without mandatory React",
			"standalone CLI", "strict schema-2 compile and four references",
			"npm audit signatures", "optional React entry",
		],
	}));
} finally {
	rmSync(scratch, { recursive: true, force: true });
}
