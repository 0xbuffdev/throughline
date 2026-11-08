import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const scratch = mkdtempSync(join(tmpdir(), "throughline-audit-"));

function run(command, args, cwd) {
	const result = spawnSync(command, args, {
		cwd,
		encoding: "utf8",
		maxBuffer: 8 * 1024 * 1024,
	});
	if (result.error || result.status !== 0) {
		throw new Error(
			[command, ...args].join(" ") +
				" failed:\n" +
				(result.stdout ?? "") +
				"\n" +
				(result.stderr ?? "") +
				(result.error ? "\n" + result.error.message : ""),
		);
	}
	return result.stdout;
}

try {
	const tarball = join(scratch, "throughline.tgz");
	run("pnpm", ["pack", "--out", tarball], root);
	const entries = run("tar", ["-tzf", tarball], root)
		.split("\n")
		.map((line) => line.trim())
		.filter(Boolean);
	for (const file of [
		"package/package.json",
		"package/README.md",
		"package/LICENSE",
		"package/COPYRIGHT.md",
		"package/CHANGELOG.md",
		"package/dist/index.js",
		"package/dist/index.d.ts",
		"package/dist/react/index.js",
		"package/dist/react/index.d.ts",
		"package/dist/examples.js",
		"package/dist/examples.d.ts",
		"package/src/styles/throughline.css",
	]) {
		assert(entries.includes(file), "Missing packed file: " + file);
	}
	assert(
		!entries.some(
			(file) =>
				file.includes("/__tests__/") ||
				/\.(?:test|spec)\.[cm]?[jt]sx?$/.test(file) ||
				(file.startsWith("package/src/") &&
					!file.startsWith("package/src/styles/")),
		),
		"Tests or unapproved source were packed",
	);
	const packed = JSON.parse(
		run("tar", ["-xOf", tarball, "package/package.json"], root),
	);
	const copyrightText = run(
		"tar",
		["-xOf", tarball, "package/COPYRIGHT.md"],
		root,
	);
	assert.match(copyrightText, /Copyright 2026 0xBUFF/);
	assert.equal(packed.name, "@0xbuff/throughline");
	assert.equal(packed.version, "0.0.1", "Packed version must match release candidate");
	assert.equal(packed.private, false, "Packed package must not be private");
	assert.equal(packed.publishConfig?.access, "public", "Public scoped access required");
	assert.equal(packed.license, "Apache-2.0", "Packed metadata must include the approved license");
	assert(
		!packed.bundleDependencies && !packed.bundledDependencies,
		"Bundled dependencies require a separate third-party rights audit",
	);
	assert(
		!entries.some((entry) => entry.startsWith("package/node_modules/")),
		"Unexpected bundled dependency content in published archive",
	);
	assert.deepEqual(
		Object.keys(packed.exports).sort(),
		[".", "./react", "./examples", "./styles/throughline.css"].sort(),
	);
	assert.deepEqual(Object.keys(packed.dependencies ?? {}), ["cn"]);
	for (const dependencies of [
		packed.dependencies ?? {},
		packed.peerDependencies ?? {},
		packed.optionalDependencies ?? {},
	]) {
		for (const version of Object.values(dependencies)) {
			assert(
				!String(version).includes("workspace:") &&
					!String(version).includes("catalog:"),
				"An unresolved workspace/catalog dependency was packed",
			);
		}
	}

	const consumer = join(scratch, "consumer");
	mkdirSync(consumer);
	writeFileSync(
		join(consumer, "package.json"),
		JSON.stringify({ name: "throughline-consumer", private: true, type: "module" }),
	);
	const flags = [
		"--no-audit",
		"--no-fund",
		"--no-package-lock",
		"--ignore-scripts",
	];
	run(
		"npm",
		["install", ...flags, "--omit=peer", tarball, "typescript@^5.9.3"],
		consumer,
	);
	assert(
		!existsSync(join(consumer, "node_modules", "react")),
		"Core consumer unexpectedly installed React",
	);
	const core = [
		'import assert from "node:assert/strict";',
		'import { compile, ProgramError } from "@0xbuff/throughline";',
		'import { EXAMPLES } from "@0xbuff/throughline/examples";',
		'assert(Array.isArray(EXAMPLES) && EXAMPLES.length > 0);',
		'assert(compile(EXAMPLES[0].source).frames.length > 0);',
		'assert.throws(() => compile("not a thl block"), ProgramError);',
	].join("\n");
	run("node", ["--input-type=module", "-e", core], consumer);

	writeFileSync(
		join(consumer, "index.ts"),
		[
			'import { compile, type Trace } from "@0xbuff/throughline";',
			'import { EXAMPLES } from "@0xbuff/throughline/examples";',
			'const trace: Trace = compile(EXAMPLES[0]!.source);',
			'const frames: number = trace.frames.length;',
			'if (frames < 1) throw new Error("Missing trace frames");',
		].join("\n"),
	);
	writeFileSync(
		join(consumer, "tsconfig.json"),
		JSON.stringify({
			compilerOptions: {
				module: "NodeNext",
				moduleResolution: "NodeNext",
				target: "ES2022",
				strict: true,
				noEmit: true,
				skipLibCheck: false,
			},
			include: ["index.ts"],
		}),
	);
	run("node", ["node_modules/typescript/bin/tsc", "-p", "."], consumer);

	// Node-only verification is complete before installing the optional peer.
	run(
		"npm",
		["install", ...flags, "--no-save", "react@^19", "react-dom@^19"],
		consumer,
	);
	const ssr = [
		'import assert from "node:assert/strict";',
		'import { createElement } from "react";',
		'import { renderToString } from "react-dom/server";',
		'import { compile } from "@0xbuff/throughline";',
		'import { ThroughlinePlayer } from "@0xbuff/throughline/react";',
		'const fence = String.fromCharCode(96).repeat(3);',
		'const trace = compile([fence+"thl binary","a = 1","b = 1",fence].join(String.fromCharCode(10)));',
		'const html = renderToString(createElement(ThroughlinePlayer, { trace }));',
		'assert(html.includes("Visualization player"));',
	].join("\n");
	run("node", ["--input-type=module", "-e", ssr], consumer);
	console.log("Packed Throughline passed Node-only, TypeScript and React SSR checks.");
} finally {
	rmSync(scratch, { recursive: true, force: true });
}
