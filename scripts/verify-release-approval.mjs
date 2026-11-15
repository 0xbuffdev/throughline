/**
 * TL-U19 review handoff: a protected workflow may stage ONLY after a human
 * repository maintainer posts a real TL-U18 screen-reader acceptance comment
 * bound to both exact source SHA and this immutable candidate tarball SHA.
 *
 * The code verifies the attestation's provenance and consistency; it cannot
 * independently establish that a human actually used a screen reader.
 * GitHub environment approval and npm 2FA remain separate gates.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const FIELDS = [
	"source-sha", "tarball-sha256", "tested-on", "screen-reader",
	"browser-os", "record-url", "result",
];

export function verifyReleaseApproval({ comment, manifest, id }) {
	assert(/^[1-9]\d{0,19}$/.test(String(id)) &&
		Number.isSafeInteger(Number(id)), "Safe GitHub numeric issue-comment ID required");
	assert.equal(comment.id, Number(id), "Release acceptance comment ID mismatch");
	assert(comment.user && comment.user.type === "User", "A human GitHub user must attest");
	assert(["OWNER", "MEMBER", "COLLABORATOR"].includes(comment.author_association),
		"Only a GitHub repository maintainer may record the acceptance");
	assert.equal(comment.html_url?.startsWith("https://github.com/0xbuffdev/throughline/"), true,
		"Acceptance comment must be in the Throughline repository");
	assert(typeof comment.body === "string" && comment.body.length <= 12_000,
		"Malformed acceptance comment");
	const lines = comment.body.trim().split(/\r?\n/).map(s => s.trim());
	assert.equal(lines.shift(), "TL-U18-AT-ACCEPTED",
		"Actual human TL-U18 screen-reader acceptance required");
	const fields = new Map();
	for (const line of lines) {
		if (!line) continue;
		const match = /^([a-z][a-z0-9-]*): (.+)$/.exec(line);
		assert(match, "Unexpected acceptance-record line: " + line.slice(0, 50));
		assert(FIELDS.includes(match[1]), "Unknown release approval field");
		assert(!fields.has(match[1]), "Duplicate release approval field");
		fields.set(match[1], match[2]);
	}
	assert.deepEqual([...fields.keys()].sort(), [...FIELDS].sort(),
		"Acceptance review requires every mandatory field");
	assert.equal(fields.get("source-sha"), manifest.sourceSha,
		"Human acceptance must cite the exact tested source SHA");
	assert.equal(fields.get("tarball-sha256"), manifest.sha256,
		"Human acceptance must cite this exact reviewed release archive");
	assert.match(fields.get("tested-on"), /^20\d{2}-\d{2}-\d{2}$/,
		"Date of actual screen-reader test required");
	assert(!/^(?:not performed|not tested|pending|tbd|none|n\/a)$/i.test(fields.get("screen-reader")),
		"Actual real screen-reader and version required");
	assert(fields.get("screen-reader").length >= 5);
	assert(fields.get("browser-os").length >= 8);
	assert.match(fields.get("record-url"),
		/^https:\/\/github\.com\/0xbuffdev\/throughline\/(?:pull|issues)\/\d+(?:#[-_A-Za-z0-9]+)?$/,
		"Link to actual manually reviewed AT test record required");
	assert.equal(fields.get("result"), "pass",
		"Blocking failures or unperformed tests prohibit staging");
	const created = Date.parse(comment.created_at);
	const edited = Date.parse(comment.updated_at);
	assert(Number.isFinite(created) && Number.isFinite(edited));
	assert(created <= edited, "Malformed GitHub acceptance history");
	return {
		reviewer: comment.user.login,
		commentId: comment.id,
		commentUrl: comment.html_url,
		sourceSha: manifest.sourceSha,
		sha256: manifest.sha256,
		recordUrl: fields.get("record-url"),
		testDate: fields.get("tested-on"),
		// The result is a human claim validated for structure and authorship,
		// not automated verification of screen-reader speech.
		status: "human maintainer attestation recorded; independently inspect evidence",
	};
}

const ownPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (ownPath === fileURLToPath(import.meta.url)) {
	const [manifestPath, commentPath, id] = process.argv.slice(2);
	assert(manifestPath && commentPath && id && process.argv.length === 5,
		"Usage: node scripts/verify-release-approval.mjs RELEASE_MANIFEST.json comment.json <id>");
	const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
	const comment = JSON.parse(readFileSync(commentPath, "utf8"));
	console.log("TL_U19_APPROVAL " + JSON.stringify(
		verifyReleaseApproval({ manifest, comment, id })));
}
