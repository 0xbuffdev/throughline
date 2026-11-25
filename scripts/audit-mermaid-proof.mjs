import assert from "node:assert/strict";
import { readFileSync, existsSync, realpathSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { captureSource, sameSource } from "./mermaid-source-identity.mjs";

// Audit the test-only dependency independently of the runtime/peer allowlist.
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const before = captureSource(root);
const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
assert.equal(manifest.devDependencies.mermaid, "12.3.0", "Proof version must be pinned");
assert(!manifest.dependencies?.mermaid && !manifest.peerDependencies?.mermaid,
	"TL-U26 must not adopt a runtime Mermaid dependency");
assert.equal(Object.keys(manifest.exports).length, 6, "Proof must not expand package subpaths");
for (const file of readdirSync(join(root, "dist"), { recursive: true })) {
	if (!/\.(?:js|ts)$/.test(file)) continue;
	assert(!/mermaid|thl_proof_|strokeToken/.test(readFileSync(join(root, "dist", file), "utf8")),
		"Test-only renderer leaked into distribution: " + file);
}
const seen = new Set(), packages = [];
function walk(name, parent = join(root, "node_modules")) {
	const candidates = [join(parent, name), join(root, "node_modules", name),
		join(root, "node_modules/.pnpm/node_modules", name)];
	const found = candidates.find(path => existsSync(join(path, "package.json")));
	assert(found, "Missing dependency " + name);
	const path = realpathSync(found);
	if (seen.has(path)) return;
	seen.add(path);
	const meta = JSON.parse(readFileSync(join(path, "package.json"), "utf8"));
	assert.equal(meta.name, name);
	const licenseFiles = readdirSync(path).filter(file => /^(?:licen[cs]e|copying|notice)(?:[.\-_].*)?$/i.test(file));
	packages.push({ name, version: meta.version, license: meta.license ?? "UNDECLARED",
		licenseFiles: licenseFiles.map(file => ({ file, sha256: createHash("sha256")
			.update(readFileSync(join(path, file))).digest("hex") })) });
	for (const dependency of Object.keys(meta.dependencies ?? {})) walk(dependency, dirname(path));
}
walk("mermaid");
packages.sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version));
const mermaidPath = realpathSync(join(root, "node_modules/mermaid"));
const chunkDirectory = join(mermaidPath, "dist/chunks/mermaid.esm.min");
const files = [join(mermaidPath, "dist/mermaid.esm.min.mjs"), ...readdirSync(chunkDirectory)
	.filter(file => /^(?:elk-|flowDiagram-|sequenceDiagram-).*\.mjs$/.test(file)).map(file => join(chunkDirectory, file))];
const chunks = files.map(path => {
	const bytes = readFileSync(path);
	return { file: path.slice(mermaidPath.length + 1), bytes: bytes.length, gzipBytes: gzipSync(bytes).length };
});
const after = captureSource(root);
const report = { experimental: true, runtimeAdoption: false,
	sourceSha: before.sourceSha, inputFingerprint: before.fingerprint,
	dirty: Boolean(before.status), sourceStable: sameSource(before, after),
	lockSha256: createHash("sha256").update(readFileSync(join(root, "pnpm-lock.yaml"))).digest("hex"),
	packages, chunks, notes: "Selected distributed chunks are not a full application bundle estimate. License inventory is not legal approval." };
const output = resolve(process.argv[2] ?? "/tmp/throughline-mermaid-dependencies.json");
writeFileSync(output, JSON.stringify(report, null, 2) + "\n");
assert(report.sourceStable, "Source changed during dependency audit");
console.log(JSON.stringify({ packages: packages.length,
	licenses: [...new Set(packages.map(entry => entry.license))],
	missingTexts: packages.filter(entry => !entry.licenseFiles.length).map(entry => entry.name), chunks, output }, null, 2));
