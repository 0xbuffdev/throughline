/**
 * TL-U19 post-2FA verification of the *actual published registry bytes*.
 * This script never uploads, signs, stages, or changes package/tag metadata.
 * npm audit signatures must also be run in the separately installed consumer
 * to cryptographically verify npm's provenance and registry signatures.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const NAME = "@0xbuff/throughline";
const REGISTRY = "https://registry.npmjs.org";
const digest = (archive, algorithm, encoding = "hex") =>
	createHash(algorithm).update(archive).digest(encoding);

export function verifyPublishedRegistryRelease({
	manifest, metadata, distTags, archive, expectedSha256,
}) {
	assert.match(expectedSha256, /^[0-9a-f]{64}$/, "Exact staged SHA-256 required");
	assert.equal(manifest.package, NAME);
	assert.equal(manifest.tag, "v" + manifest.version);
	assert.equal(manifest.sha256, expectedSha256, "Expected checksum must be from staged release manifest");
	assert.equal(metadata.name, NAME);
	assert.equal(metadata.version, manifest.version);
	assert.notEqual(metadata.private, true, "Registry version must be public");
	assert.equal(metadata.license, "Apache-2.0");
	assert.equal(distTags.latest, manifest.version,
		"The approved version must actually be the registry's latest version");
	const dist = metadata.dist ?? {};
	assert.equal(new URL(dist.tarball).origin, REGISTRY,
		"Registry tarball must not redirect to an untrusted origin");
	assert.equal(new URL(dist.tarball).pathname,
		"/@0xbuff/throughline/-/throughline-" + manifest.version + ".tgz");
	assert.equal(dist.shasum, digest(archive, "sha1"),
		"Registry SHA-1 does not match downloaded bytes");
	assert.equal(dist.integrity, "sha512-" + digest(archive, "sha512", "base64"),
		"Registry SHA-512 SRI does not match downloaded bytes");
	assert.equal(digest(archive, "sha256"), expectedSha256,
		"Registry archive differs from the reviewed staged GitHub Actions archive");
	assert.equal(archive.length, manifest.bytes, "Published archive size changed");
	assert(dist.attestations && typeof dist.attestations === "object",
		"npm provenance record absent: do not claim signed provenance");
	assert(typeof dist.attestations.url === "string",
		"npm attestation URL missing");
	assert.equal(new URL(dist.attestations.url).origin, REGISTRY);
	assert(dist.attestations.provenance &&
		typeof dist.attestations.provenance.predicateType === "string" &&
		dist.attestations.provenance.predicateType.length > 0,
		"npm provenance statement missing");
	return {
		ticket: "TL-U19", package: NAME, version: manifest.version,
		sourceSha: manifest.sourceSha, sha256: expectedSha256,
		registrySha512: dist.integrity,
		attestationEndpoint: dist.attestations.url,
		status: "registry bytes and attestation metadata verified",
		note: "Run npm audit signatures on a clean registry installation for cryptographic provenance verification.",
	};
}

async function get(url, bytes = false) {
	const response = await fetch(url, {
		redirect: "error",
		headers: bytes ? {} : { accept: "application/json" },
		signal: AbortSignal.timeout(25_000),
	});
	assert.equal(response.status, 200,
		"Registry HTTP " + response.status + " at " + new URL(url).pathname);
	const buffer = Buffer.from(await response.arrayBuffer());
	assert(buffer.length <= 16 * 1024 * 1024, "Registry response exceeds bounded release verifier size");
	return bytes ? buffer : JSON.parse(buffer.toString("utf8"));
}

const ownPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (ownPath === fileURLToPath(import.meta.url)) {
	const [manifestPath] = process.argv.slice(2);
	assert(manifestPath && process.argv.length === 3,
		"Usage: node scripts/verify-registry-release.mjs <reviewed-RELEASE_MANIFEST.json>");
	const { readFileSync } = await import("node:fs");
	const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
	assert.match(manifest.version, /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/);
	const versionUrl = REGISTRY + "/@0xbuff%2fthroughline/" + manifest.version;
	const [metadata, packument] = await Promise.all([
		get(versionUrl),
		get(REGISTRY + "/@0xbuff%2fthroughline"),
	]);
	assert.equal(packument.versions?.[manifest.version]?.version, manifest.version,
		"Published version is absent in the npm packument");
	const archive = await get(metadata.dist?.tarball, true);
	const verified = verifyPublishedRegistryRelease({
		manifest, metadata, distTags: packument["dist-tags"],
		archive, expectedSha256: manifest.sha256,
	});
	console.log("TL_U19_REGISTRY " + JSON.stringify(verified));
}
