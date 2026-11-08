import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
	copyFileSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const main = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
assert.equal(main.name, "@0xbuff/throughline");
assert.equal(main.version, "0.0.0");
assert.equal(main.private, true, "Actual Throughline package must remain private");
assert.equal(main.license, "Apache-2.0");
assert(
	readFileSync(join(root, "COPYRIGHT.md"), "utf8").includes("Copyright 2026 0xBUFF"),
	"Expected designated copyright attribution",
);

const candidate = {
	name: "@0xbuff/throughline",
	version: "0.0.0",
	description: "Registration-only candidate, not the Throughline engine",
	license: "Apache-2.0",
	private: false,
	type: "module",
	files: ["README.md", "LICENSE", "COPYRIGHT.md"],
	publishConfig: { access: "public" },
};
const readme = [
	"# Throughline registration candidate",
	"",
	"**Not a functional package; do not install.**",
	"",
	"This minimal candidate is solely for a separately authorized first",
	"npm staged-registration step. It contains no compiler, React player,",
	"application data, build scripts or npm dependencies.",
	"",
	"The functional Throughline package is not published by this action.",
	"",
].join("\n");

const temp = mkdtempSync(join(tmpdir(), "throughline-registration-"));
const destination = join(root, "registration-preview");
try {
	writeFileSync(join(temp, "package.json"), JSON.stringify(candidate, null, 2) + "\n");
	writeFileSync(join(temp, "README.md"), readme);
	copyFileSync(join(root, "LICENSE"), join(temp, "LICENSE"));
	copyFileSync(join(root, "COPYRIGHT.md"), join(temp, "COPYRIGHT.md"));
	mkdirSync(destination, { recursive: true });
	const pack = JSON.parse(
		execFileSync(
			"npm",
			["pack", "--ignore-scripts", "--json", "--pack-destination", destination],
			{ cwd: temp, encoding: "utf8", timeout: 30_000 },
		),
	);
	assert.equal(pack.length, 1, "Expected one locally packed registration candidate");
	const tarball = join(destination, pack[0].filename);
	const members = execFileSync("tar", ["-tzf", tarball], {
		cwd: root,
		encoding: "utf8",
	}).trim().split("\n").sort();
	assert.deepEqual(
		members,
		[
			"package/package.json",
			"package/README.md",
			"package/LICENSE",
			"package/COPYRIGHT.md",
		].sort(),
		"Registration candidate must contain exactly four reviewed files",
	);
	const packedManifest = JSON.parse(
		execFileSync("tar", ["-xOf", tarball, "package/package.json"], {
			encoding: "utf8",
		}),
	);
	assert.equal(packedManifest.name, candidate.name);
	assert.equal(packedManifest.version, candidate.version);
	assert.equal(packedManifest.private, false);
	assert.equal(packedManifest.license, "Apache-2.0");
	assert.deepEqual(packedManifest.dependencies ?? {}, {});
	assert.deepEqual(packedManifest.scripts ?? {}, {});
	assert.deepEqual(Object.keys(packedManifest.exports ?? {}), []);
	const digest = createHash("sha256").update(readFileSync(tarball)).digest("hex");
	writeFileSync(join(destination, "SHA256SUMS"), digest + "  " + pack[0].filename + "\n");
	writeFileSync(
		join(destination, "REGISTRATION_INFO.txt"),
		[
			"package=@0xbuff/throughline",
			"candidate_version=0.0.0",
			"candidate_functionality=none",
			"source_package_private=true",
			"staging=not_authorized",
			"publication=not_authorized",
			"archive=" + pack[0].filename,
			"sha256=" + digest,
			"",
		].join("\n"),
	);
	console.log(
		"Packed nonfunctional candidate; four reviewed files only.\n" +
		"Archive: " + pack[0].filename + "\nSHA-256: " + digest +
		"\nNo registry operation performed.",
	);
} finally {
	rmSync(temp, { recursive: true, force: true });
}
