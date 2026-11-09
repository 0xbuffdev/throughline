import assert from "node:assert/strict";
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

for (const filename of ["index.js", "react/index.js", "remark/index.js", "examples.js"]) {
	assert(
		existsSync(resolve(root, "dist", `${filename}.map`)),
		`Missing JavaScript source map: ${filename}.map`,
	);
}

const load = (entry) =>
	import(pathToFileURL(resolve(root, "dist", entry)).href);
const { compile } = await load("index.js");
assert.equal(typeof compile, "function");
const trace = compile("```thl binary\na = 1\nb = 1\n```");
assert.deepEqual(
	trace.frames.at(-1)?.state.entities.find((entity) => entity.id === "sum")
		?.value,
	[1, 0],
);
const { remarkThroughline } = await load("remark/index.js");
assert.equal(typeof remarkThroughline, "function");
const { EXAMPLES } = await load("examples.js");
assert(Array.isArray(EXAMPLES) && EXAMPLES.length > 0);
const { ThroughlinePlayer } = await load("react/index.js");
assert.equal(typeof ThroughlinePlayer, "function");
console.log("Throughline build exports, declarations, maps and smoke checks passed.");
