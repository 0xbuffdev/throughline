/**
 * TL-U19 immutable staged tarball manifest: both the build and the protected
 * stage job verify the SAME bytes, source commit, tag, package and exports.
 * This deliberately does not prove human accessibility approval or publish.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, statSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const NAME = "@0xbuff/throughline";
const EXPORTS = [".", "./examples", "./node", "./react", "./remark",
	"./styles/throughline.css"];
const requiredEntries = [
	"package/package.json", "package/LICENSE", "package/COPYRIGHT.md",
	"package/CHANGELOG.md", "package/README.md", "package/dist/index.js",
	"package/dist/index.d.ts", "package/dist/remark/index.js",
	"package/dist/react/index.js", "package/dist/node/index.js",
	"package/dist/examples.js", "package/dist/cli/main.js",
	"package/src/styles/throughline.css",
];
const digest = (bytes, algorithm = "sha256") =>
	createHash(algorithm).update(bytes).digest("hex");

export function inspectReleaseArtifact({
	source, packed, sha256Line, archive, sourceSha, tag, entries,
}) {
	assert.match(sourceSha, /^[a-f0-9]{40}$/, "Exact checked-out commit is required");
	assert.match(tag, /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/,
		"Exact signed SemVer tag required");
	assert.equal(source.name, NAME);
	assert.equal(packed.name, NAME);
	assert.equal(source.version, tag.slice(1), "Signed tag must match source version");
	assert.equal(packed.version, source.version, "Packed archive version mismatch");
	assert.equal(source.private, false);
	assert.equal(packed.private, false);
	assert.equal(source.license, "Apache-2.0");
	assert.equal(packed.license, "Apache-2.0");
	assert.equal(packed.publishConfig?.access, "public");
	assert.deepEqual(Object.keys(packed.exports ?? {}).sort(), [...EXPORTS].sort());
	assert.deepEqual(packed.exports, source.exports,
		"Do not rewrite exports while constructing the archive");
	assert.equal(packed.bin?.thl, "./dist/cli/main.js");
	assert.deepEqual(packed.bin, source.bin);
	assert.equal(packed.engines?.node, ">=24");
	assert(!packed.bundleDependencies && !packed.bundledDependencies,
		"Third-party dependencies may not be silently bundled");
	assert(entries.length > 0);
	assert.equal(new Set(entries).size, entries.length, "Duplicate tar member");
	for (const expected of requiredEntries)
		assert(entries.includes(expected), "Missing distribution file " + expected);
	assert(entries.every(entry => entry.startsWith("package/") &&
		!entry.includes("..") && !entry.startsWith("package/docs/") &&
		!entry.startsWith("package/node_modules/") &&
		!entry.includes("/__tests__/") && !/\.test\.[jt]sx?$/.test(entry) &&
		(!entry.startsWith("package/src/") || entry.startsWith("package/src/styles/"))),
		"Unapproved or unsafe member in release archive");
	const sha256 = digest(archive);
	assert.equal(sha256Line.trim(), sha256 + "  throughline.tgz",
		"SHA256SUMS does not match immutable staged archive");
	return {
		format: 1,
		ticket: "TL-U19",
		package: NAME,
		version: source.version,
		tag,
		sourceSha,
		tarball: "throughline.tgz",
		sha256,
		sha512: "sha512-" + createHash("sha512").update(archive).digest("base64"),
		bytes: archive.length,
		fileCount: entries.length,
		// The actual manual AT evidence remains an independent human gate.
		attestation: "candidate-bytes-only; not publication or human approval",
	};
}

export function verifyReleaseRecord(record, expected) {
	assert.deepEqual(record, expected,
		"Staged archive manifest is stale, incomplete or belongs to another commit");
	return true;
}

const ownPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (ownPath === fileURLToPath(import.meta.url)) {
	const [mode, dirArg] = process.argv.slice(2);
	assert(["create", "verify"].includes(mode), "Usage: release-artifact.mjs create|verify <directory>");
	assert(dirArg, "Artifact directory is required");
	const dir = resolve(dirArg);
	const sourceSha = process.env.THL_SOURCE_SHA;
	const tag = process.env.THL_RELEASE_TAG;
	assert(sourceSha && tag, "THL_SOURCE_SHA and THL_RELEASE_TAG required");
	assert.equal(readFileSync(resolve(dir, "RELEASE_COMMIT"), "utf8").trim(), sourceSha,
		"RELEASE_COMMIT does not match signed source");
	const archive = readFileSync(resolve(dir, "throughline.tgz"));
	const sha256Line = readFileSync(resolve(dir, "SHA256SUMS"), "utf8");
	const source = JSON.parse(readFileSync("package.json", "utf8"));
	const packed = JSON.parse(execFileSync("tar", [
		"-xOf", resolve(dir, "throughline.tgz"), "package/package.json",
	], { encoding: "utf8" }));
	const entries = execFileSync("tar", ["-tzf", resolve(dir, "throughline.tgz")],
		{ encoding: "utf8" }).split("\n").filter(Boolean);
	const record = inspectReleaseArtifact({
		source, packed, archive, sha256Line, sourceSha, tag, entries,
	});
	assert.equal(statSync(resolve(dir, "throughline.tgz")).size, record.bytes);
	const destination = resolve(dir, "RELEASE_MANIFEST.json");
	if (mode === "create") {
		writeFileSync(destination, JSON.stringify(record, null, 2) + "\n", { flag: "wx" });
	} else {
		verifyReleaseRecord(JSON.parse(readFileSync(destination, "utf8")), record);
	}
	console.log("TL_U19_ARCHIVE " + JSON.stringify(record));
}
