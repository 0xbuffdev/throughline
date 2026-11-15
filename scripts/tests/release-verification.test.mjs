import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { inspectReleaseArtifact, verifyReleaseRecord } from "../release-artifact.mjs";
import { verifyPublishedRegistryRelease } from "../verify-registry-release.mjs";
import { verifyReleaseApproval } from "../verify-release-approval.mjs";

const hash = (b, algorithm, encoding = "hex") =>
	createHash(algorithm).update(b).digest(encoding);
const exportsMap = {
	".": "./dist/index.js", "./examples": "./dist/examples.js",
	"./node": "./dist/node/index.js", "./react": "./dist/react/index.js",
	"./remark": "./dist/remark/index.js",
	"./styles/throughline.css": "./src/styles/throughline.css",
};
const manifest = () => ({
	name: "@0xbuff/throughline", version: "0.2.0", private: false,
	license: "Apache-2.0", publishConfig: { access: "public" },
	engines: { node: ">=24" },
	exports: structuredClone(exportsMap), bin: { thl: "./dist/cli/main.js" },
});
const entries = [
	"package/package.json", "package/LICENSE", "package/COPYRIGHT.md",
	"package/CHANGELOG.md", "package/README.md", "package/dist/index.js",
	"package/dist/index.d.ts", "package/dist/remark/index.js",
	"package/dist/react/index.js", "package/dist/node/index.js",
	"package/dist/examples.js", "package/dist/cli/main.js",
	"package/src/styles/throughline.css",
];
const archive = Buffer.from("mock gzip bytes for shape-only test");
const sourceSha = "a".repeat(40);
const artifact = () => inspectReleaseArtifact({
	source: manifest(), packed: manifest(),
	archive, sha256Line: hash(archive, "sha256") + "  throughline.tgz\n",
	sourceSha, tag: "v0.2.0", entries,
});

test("TL-U19 binds immutable archive bytes, tag, public exports and source SHA", () => {
	const record = artifact();
	assert.deepEqual({
		tag: record.tag, version: record.version, sourceSha: record.sourceSha,
		sha256: record.sha256, bytes: record.bytes, fileCount: record.fileCount,
	}, {
		tag: "v0.2.0", version: "0.2.0", sourceSha,
		sha256: hash(archive, "sha256"), bytes: archive.length,
		fileCount: entries.length,
	});
	assert(verifyReleaseRecord(structuredClone(record), record));
	assert.throws(() => verifyReleaseRecord({ ...record, sourceSha: "b".repeat(40) }, record));
});

test("TL-U19 rejects source, tag, archive or export substitution", () => {
	const base = {
		source: manifest(), packed: manifest(), archive,
		sha256Line: hash(archive, "sha256") + "  throughline.tgz\n",
		sourceSha, tag: "v0.2.0", entries,
	};
	for (const modified of [
		{ sourceSha: "a".repeat(39) }, { tag: "v0.2.1" },
		{ sha256Line: "f".repeat(64) + "  throughline.tgz\n" },
		{ packed: { ...manifest(), version: "0.1.0" } },
		{ packed: { ...manifest(), exports: { ".": "./dist/index.js" } } },
		{ packed: { ...manifest(), bin: { thl: "./bad" } } },
		{ entries: entries.filter(x => x !== "package/dist/cli/main.js") },
		{ entries: [...entries, "package/node_modules/token.txt"] },
		{ entries: [...entries, entries[0]] },
		{ entries: [...entries, "package/src/__tests__/secret.test.ts"] },
	]) {
		assert.throws(() => inspectReleaseArtifact({ ...base, ...modified }));
	}
});

const registryRecord = () => {
	const record = artifact();
	const metadata = {
		name: "@0xbuff/throughline", version: "0.2.0",
		private: false, license: "Apache-2.0",
		dist: {
			tarball: "https://registry.npmjs.org/@0xbuff/throughline/-/throughline-0.2.0.tgz",
			shasum: hash(archive, "sha1"),
			integrity: "sha512-" + hash(archive, "sha512", "base64"),
			attestations: {
				url: "https://registry.npmjs.org/-/npm/v1/attestations/@0xbuff/throughline@0.2.0",
				provenance: { predicateType: "https://slsa.dev/provenance/v1" },
			},
		},
	};
	return { manifest: record, metadata, archive,
		distTags: { latest: "0.2.0" },
		expectedSha256: record.sha256 };
};

test("TL-U19 post-publish read-only check binds registry tarball to staged SHA and provenance metadata", () => {
	const record = registryRecord();
	const verified = verifyPublishedRegistryRelease(record);
	assert.equal(verified.version, "0.2.0");
	assert.equal(verified.sourceSha, sourceSha);
	assert.equal(verified.sha256, record.expectedSha256);
});

test("TL-U19 refuses lookalike registry origins, altered bytes, tag movement and absent attestations", () => {
	const cases = [
		{
			...registryRecord(),
			metadata: {
				...registryRecord().metadata,
				dist: { ...registryRecord().metadata.dist,
					tarball: "https://evil.example.invalid/@0xbuff/throughline/-/throughline-0.2.0.tgz" },
			},
		},
		{ ...registryRecord(), archive: Buffer.from("tampered release tarball") },
		{ ...registryRecord(), expectedSha256: "0".repeat(64) },
		{ ...registryRecord(), distTags: { latest: "0.1.0" } },
		{ ...registryRecord(), metadata: { ...registryRecord().metadata, version: "0.1.0" } },
		{ ...registryRecord(), metadata: {
			...registryRecord().metadata,
			dist: { ...registryRecord().metadata.dist, attestations: undefined },
		} },
	];
	for (const suspect of cases)
		assert.throws(() => verifyPublishedRegistryRelease(suspect));
});

test("TL-U19 staging cannot auto-publish and release tests are required by main CI", () => {
	const workflow = readFileSync(".github/workflows/publish.yml", "utf8");
	const ci = readFileSync(".github/workflows/ci.yml", "utf8");
	assert.match(workflow, /workflow_dispatch:/);
	assert.match(workflow, /environment: npm-publish/);
	assert.match(workflow, /npm stage publish/);
	assert.doesNotMatch(workflow, /(^|\s)npm publish\s/m);
	assert.match(workflow, /id-token: write/);
	assert.match(workflow, /release-artifact\.mjs create/);
	assert.match(workflow, /release-artifact\.mjs verify/);
	assert.match(ci, /test:release-tooling/);
});


const comment = () => ({
	id: 6930012942,
	html_url: "https://github.com/0xbuffdev/throughline/issues/100#issuecomment-6930012942",
	author_association: "MEMBER",
	user: { login: "example-maintainer", type: "User" },
	created_at: "2026-11-15T19:00:00Z",
	updated_at: "2026-11-15T19:00:00Z",
	body: [
		"TL-U18-AT-ACCEPTED",
		"source-sha: " + sourceSha,
		"tarball-sha256: " + artifact().sha256,
		"tested-on: 2026-11-15",
		"screen-reader: NVDA 2026.3",
		"browser-os: Firefox 145 / Windows 11",
		"record-url: https://github.com/0xbuffdev/throughline/pull/44#issuecomment-6930012941",
		"result: pass",
	].join("\n"),
});

test("TL-U19 accepts only an actual maintainer's SHA-bound real AT review claim", () => {
	const accepted = verifyReleaseApproval({
		comment: comment(), manifest: artifact(), id: "6930012942",
	});
	assert.equal(accepted.reviewer, "example-maintainer");
	assert.equal(accepted.sourceSha, sourceSha);
});

test("TL-U19 denies absent, stale, untrusted or duplicate human gate claims", () => {
	const baseline = comment();
	const cases = [
		{ ...baseline, user: { type: "Bot", login: "example-bot" } },
		{ ...baseline, author_association: "NONE" },
		{ ...baseline, id: 123 },
		{ ...baseline, html_url: "https://evil.example.invalid/" },
		{ ...baseline, body: baseline.body.replace("TL-U18-AT-ACCEPTED", "TL-U18-AT-PENDING") },
		{ ...baseline, body: baseline.body.replace(sourceSha, "b".repeat(40)) },
		{ ...baseline, body: baseline.body.replace(artifact().sha256, "1".repeat(64)) },
		{ ...baseline, body: baseline.body.replace("NVDA 2026.3", "NOT PERFORMED") },
		{ ...baseline, body: baseline.body.replace("result: pass", "result: fail") },
		{ ...baseline, body: baseline.body + "\nresult: pass" },
		{ ...baseline, body: baseline.body.replace("tested-on: 2026-11-15", "") },
	];
	for (const suspect of cases)
		assert.throws(() => verifyReleaseApproval({
			comment: suspect, manifest: artifact(), id: "6930012942",
		}), "Failed to reject " + String(suspect.body).slice(0, 50));
});
