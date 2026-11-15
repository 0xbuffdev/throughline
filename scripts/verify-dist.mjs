import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const manifest = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
const expected = [
	".",
	"./react",
	"./remark",
	"./examples",
	"./node",
	"./styles/throughline.css",
];
assert.deepEqual(Object.keys(manifest.exports).sort(), expected.sort());

for (const [name, declaration] of Object.entries(manifest.exports)) {
	const targets =
		typeof declaration === "string"
			? [declaration]
			: Object.values(declaration);
	for (const target of targets) {
		assert.equal(typeof target, "string", `Invalid export for ${name}`);
		assert(target.startsWith("./"), `Unexpected export target: ${target}`);
		const absolute = resolve(root, target);
		const local = relative(root, absolute);
		assert(
			!local.startsWith("..") && !isAbsolute(local),
			`Export escapes package: ${target}`,
		);
		assert(existsSync(absolute), `Missing ${name} export: ${target}`);
	}
}

const artifacts = readdirSync(resolve(root, "dist"), { recursive: true }).map(
	(path) => String(path).replaceAll("\\", "/"),
);
assert(
	!artifacts.some(
		(path) =>
			path === "__tests__" ||
			path.includes("/__tests__/") ||
			/\.(?:test|spec)\.[cm]?[jt]sx?$/.test(path),
	),
	"Test files must not be bundled into dist",
);
assert(
	!artifacts.some((path) => path.endsWith(".d.ts.map")),
	"Declaration maps must not reference unshipped TypeScript sources",
);

// With more than one compiler entry, Rolldown may emit a source-less
// re-export facade for the root, with executable core in a mapped chunk.
for (const filename of ["react/index.js", "remark/index.js", "examples.js", "node/index.js", "cli/main.js"]) {
	if (!existsSync(resolve(root, "dist", filename + ".map"))) {
		// Rolldown emits a source-less re-export facade when shared code
		// is emitted into a separately mapped chunk.
		const facade = readFileSync(resolve(root, "dist", filename), "utf8");
		assert(
			facade.length < 1024 && (facade.includes("export") || facade.includes("from")),
			"Missing JavaScript source map or mapped facade: " + filename,
		);
	}
}
if (!existsSync(resolve(root, "dist/index.js.map"))) {
	const rootFacade = readFileSync(resolve(root, "dist/index.js"), "utf8");
	assert(
		rootFacade.length < 16 * 1024 &&
			(rootFacade.includes("export") || rootFacade.includes("from")) &&
			artifacts.some((file) => file.endsWith(".js.map")),
		"Unmapped root entry must be a bounded re-export facade with mapped chunks (size=" + rootFacade.length + ", maps=" + artifacts.filter(f => f.endsWith(".js.map")).length + ")",
	);
}

const load = (entry) =>
	import(pathToFileURL(resolve(root, "dist", entry)).href);
// Node validation is a completely separate entry: the core must not import IO.
const { createNodeThroughlineHost } = await load("node/index.js");
assert.equal(typeof createNodeThroughlineHost, "function");
assert.equal(manifest.bin?.thl, "./dist/cli/main.js");
const cli = resolve(root, manifest.bin.thl);
assert(existsSync(cli), "Missing published standalone thl binary");
assert.match(readFileSync(cli, "utf8").slice(0, 80), /^#!\/usr\/bin\/env node/,
	"CLI executable requires a Node shebang");
const help = spawnSync(process.execPath, [cli, "help"], { cwd: root, encoding: "utf8" });
assert.equal(help.status, 0, help.stderr);
assert.match(help.stdout, /thl materialize/);
// Keep the pure package root free of Node-only and React dependencies.
const pure = readFileSync(resolve(root, "dist/index.js"), "utf8");
assert(!pure.includes("node:fs") && !pure.includes("node:crypto"),
	"Core root must not import CLI filesystem or crypto dependencies");
const core = await load("index.js");
assert.equal(typeof core.compile, "undefined", "Old domain compiler is not exported");
assert.equal(typeof core.SUPPORTED_DOMAINS, "undefined", "Old domain router not public");
assert.equal(typeof core.compileArtifact, "function");
const exampleArtifact = {
	schemaVersion: 2, id: "counter",
	origins: [{ id: "author", kind: "authored" }],
	entities: [{ id: "counter", label: "Counter" }], relations: [],
	initialState: { counter: { status: "known", value: 0 } },
	steps: [{ id: "increment", label: "Increment", events: [
		{ id: "write", originId: "author", type: "write",
			entityId: "counter", path: [], value: { status: "known", value: 1 } },
	] }],
};
const trace = core.compileArtifact(exampleArtifact);
assert.deepEqual(trace.frames.map(frame => frame.id), ["@initial", "increment"]);
const cell = core.inspectTrace(trace).valueAt(1, "counter");
assert.equal(cell.status, "known");
assert.equal(cell.value, 1);
assert.equal(Object.getPrototypeOf(cell), null, "Queried cells must be immutable plain data");
const { remarkThroughline } = await load("remark/index.js");
assert.equal(typeof remarkThroughline, "function");
const { EXAMPLES } = await load("examples.js");
assert(Array.isArray(EXAMPLES) && EXAMPLES.length === 4);
assert(EXAMPLES.every(example => example.artifact.schemaVersion === 2 &&
	Array.isArray(example.questions) && example.questions.length >= 3));
const react = await load("react/index.js");
assert.deepEqual(Object.keys(react).sort(), ["ThroughlineEmbed", "ThroughlineGraphPlayer"].sort());
console.log("Throughline build exports, declarations, maps and smoke checks passed.");
