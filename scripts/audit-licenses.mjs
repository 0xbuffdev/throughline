import assert from "node:assert/strict";
import { existsSync, readFileSync, realpathSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

assert.deepEqual(
	Object.keys(manifest.dependencies ?? {}).sort(),
	["cn"],
	"Unreviewed direct production dependency",
);
assert.deepEqual(
	Object.keys(manifest.peerDependencies ?? {}).sort(),
	["react", "react-dom"],
	"Unreviewed peer dependency",
);
assert.equal(manifest.license, "Apache-2.0");
assert.equal(manifest.name, "@0xbuff/throughline");
assert.equal(manifest.private, false, "Public package must not be private");
assert.equal(manifest.version, "0.0.1", "First-release version mismatch");
assert.equal(
	manifest.publishConfig?.access,
	"public",
	"Scoped package must have public registry access",
);
assert(
	!manifest.bundledDependencies && !manifest.bundleDependencies,
	"Bundled third-party packages require separate license and notice review",
);

const visited = new Map();
function requirePackage(name, parent) {
	// pnpm's isolated linker keeps a dependency's children beside its own
	// symlink target; first-level dependencies use root/node_modules.
	const locations = parent
		? [join(dirname(parent), name), join(root, "node_modules", name)]
		: [join(root, "node_modules", name)];
	const location = locations.find((candidate) => existsSync(candidate));
	assert(location, "Missing installed dependency: " + name);
	const path = realpathSync(location);
	const meta = JSON.parse(readFileSync(join(path, "package.json"), "utf8"));
	assert.equal(meta.name, name, "Unexpected resolved dependency: " + name);
	return { path, meta };
}
function licenseFile(packagePath) {
	const licenses = readdirSync(packagePath).filter((name) =>
		/^(?:licen[cs]e|copying)(?:[.\-_].*)?$/i.test(name),
	);
	return licenses.find((name) => statSync(join(packagePath, name)).isFile());
}
function auditPackage(name, parent) {
	const { path, meta } = requirePackage(name, parent);
	if (visited.has(path)) return;
	visited.set(path, { name: meta.name, version: meta.version, license: meta.license });
	assert.equal(
		meta.license,
		"MIT",
		"Unreviewed license for " + meta.name + "@" + meta.version,
	);
	assert(licenseFile(path), "Missing installed license text for " + meta.name);
	for (const dependency of Object.keys(meta.dependencies ?? {}).sort()) {
		auditPackage(dependency, path);
	}
	for (const dependency of Object.keys(meta.optionalDependencies ?? {}).sort()) {
		const location = join(dirname(path), dependency);
		if (existsSync(location)) auditPackage(dependency, path);
	}
}
for (const name of ["cn", "react", "react-dom"]) {
	auditPackage(name);
}

// The published tarball is audited separately. Keep JS dependencies external
// so the project's Apache LICENSE cannot silently cover embedded MIT files.
const generated = join(root, "dist", "react", "index.js");
assert(existsSync(generated), "Run the build before this audit");
const code = readFileSync(generated, "utf8");
assert(
	/(?:from\s*|import\s*)["']cn["']/.test(code),
	"React build no longer leaves cn external; review bundled attributions",
);
for (const entry of [...visited.values()].sort((a, b) => a.name.localeCompare(b.name))) {
	console.log(entry.name + "@" + entry.version + " — " + entry.license + " (license text present)");
}
console.log(
	"Runtime/peer license audit passed: " + visited.size +
		" installed packages checked; no package-level bundled dependencies.",
);
