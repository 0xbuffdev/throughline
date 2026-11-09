import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
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
		"package/dist/remark/index.js",
		"package/dist/remark/index.d.ts",
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
	assert.equal(packed.version, manifest.version, "Packed version must match the source manifest");
	assert.equal(packed.private, false, "Packed package must not be private");
	assert.equal(packed.publishConfig?.access, "public", "Public scoped access required");
	assert.equal(packed.license, "Apache-2.0", "Packed metadata must include the approved license");
	assert.equal(packed.homepage, "https://docs.0xbuff.com/docs/throughline");
	assert(
		!packed.bundleDependencies && !packed.bundledDependencies,
		"Bundled dependencies require a separate third-party rights audit",
	);
	assert(
		!entries.some((entry) => entry.startsWith("package/node_modules/")),
		"Unexpected bundled dependency content in published archive",
	);
	assert(
		!entries.some((entry) => entry.startsWith("package/docs/")),
		"Development documentation should remain in the source repository",
	);
	assert.deepEqual(
		Object.keys(packed.exports).sort(),
		[".", "./react", "./remark", "./examples", "./styles/throughline.css"].sort(),
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
		["install", ...flags, "--omit=peer", tarball, "typescript@5.9.3"],
		consumer,
	);
	assert(
		!existsSync(join(consumer, "node_modules", "react")) &&
			!existsSync(join(consumer, "node_modules", "unified")),
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

	// Run an independent real Remark parser without React. The adapter itself
	// adds no runtime dependency to core or the published package.
	run("npm", ["install", ...flags, "--no-save", "unified@11.0.5", "remark-parse@11.0.0", "remark-stringify@11.0.0"], consumer);
	const remark = [
		'import assert from "node:assert/strict";',
		'import { unified } from "unified";',
		'import remarkParse from "remark-parse";',
		'import remarkStringify from "remark-stringify";',
		'import { remarkThroughline } from "@0xbuff/throughline/remark";',
		'const proc = unified().use(remarkParse).use(remarkThroughline).use(remarkStringify);',
		'const md = ["# Lesson", "", "~~~thl flow", \'node x "X" = 1\', \'step "Read"\', "  focus x", "~~~", "", "~~~thl binary", "a = 1", "b = 1", "~~~", "", "~~~js", "bad", "~~~"].join("\\n");',
		'const ast = proc.parse(md);',
		'const before = JSON.stringify(ast);',
		'proc.runSync(ast, { path: "lesson.md" });',
		'assert.equal(JSON.stringify(ast), before);',
		'assert.match(String(await proc.process(md)), /(?:```|~~~)js\\nbad/);',
		'await assert.rejects(() => proc.process({ path: "broken.md", value: "# Heading\\n\\n~~~thl flow\\nnode x \\\"X\\\" = 1\\ninvalid\\n~~~" }), (error) => { assert.equal(error.line, 5); assert.equal(error.file, "broken.md"); return true; });',
		"const bodyErrors = [",
		"  { path: \"blockquote.md\", value: [\"> ~~~thl flow\", '> node a \"A\" = 1', \"> invalid\", \"> ~~~\"].join(\"\\n\"), line: 3, column: 3 },",
		"  { path: \"list.md\", value: [\"- Outer\", \"  - Inner\", \"\", \"    ~~~thl flow\", '    node a \"A\" = 1', \"    invalid\", \"    ~~~\"].join(\"\\n\"), line: 6, column: 5 },",
		"  { path: \"send.md\", value: [\"~~~thl flow\", 'node a \"A\" = 1', 'step \"Send\"', \"send missing\", \"~~~\"].join(\"\\n\"), line: 4, column: 1 },",
		"];",
		"for (const { path, value, line, column } of bodyErrors) {",
		"  await assert.rejects(() => proc.process({ path, value }), (error) => {",
		"    assert.equal(error.file, path);",
		"    assert.equal(error.line, line);",
		"    assert.equal(error.column, column);",
		"    return true;",
		"  });",
		"}",
		"const semanticErrors = [",
		"  { path: \"duplicate.md\", value: [\"~~~thl flow\", 'node a \"A\" = 1', 'node a \"A\" = 2', \"~~~\"].join(\"\\n\"), pattern: /Duplicate entity/ },",
		"  { path: \"missing-entity.md\", value: [\"~~~thl flow\", 'node a \"A\" = 1', \"link edge a -> missing\", \"~~~\"].join(\"\\n\"), pattern: /unknown entity/ },",
		"];",
		"for (const { path, value, pattern } of semanticErrors) {",
		"  await assert.rejects(() => proc.process({ path, value }), (error) => {",
		"    assert.equal(error.file, path);",
		"    assert.equal(error.line, undefined);",
		"    assert.equal(error.column, undefined);",
		"    assert.match(error.message, pattern);",
		"    return true;",
		"  });",
		"}",
	].join("\n");
	run("node", ["--input-type=module", "-e", remark], consumer);
	writeFileSync(join(consumer, "remark-typecheck.ts"), [
		'import { unified } from "unified";',
		'import remarkParse from "remark-parse";',
		'import { remarkThroughline } from "@0xbuff/throughline/remark";',
		'unified().use(remarkParse).use(remarkThroughline);',
	].join("\n"));
	run("node", ["node_modules/typescript/bin/tsc", "--strict", "--noEmit", "--skipLibCheck", "--module", "NodeNext", "--moduleResolution", "NodeNext", "--target", "ES2022", "remark-typecheck.ts"], consumer);
	assert(!existsSync(join(consumer, "node_modules", "react")), "Remark imported React");

	// Node-only verification is complete before installing the optional peer.
	// Pin direct fixture dependencies to the versions in pnpm-lock.yaml;
	// independent consumer regressions must be reproducible across CI runs.
	run(
		"npm",
		[
			"install", ...flags, "--no-save",
			"react@19.3.1", "react-dom@19.3.1", "@types/react@19.3.0",
			"@types/react-dom@19.3.0", "typescript@5.9.3", "@mdx-js/mdx@3.1.1",
		],
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
	writeFileSync(join(consumer, "embed-typecheck.ts"), [
		'import { ThroughlineEmbed, type ThroughlineEmbedProps } from "@0xbuff/throughline/react";',
		'import { remarkThroughline, type ThroughlineRemarkOptions } from "@0xbuff/throughline/remark";',
		'const props: ThroughlineEmbedProps = { source: "thl flow\\nnode x \\"X\\" = 1", theme: "dark" };',
		'const plugin: ThroughlineRemarkOptions = { mode: "mdx", componentName: "CustomTrace" };',
		'void [props, plugin, ThroughlineEmbed, remarkThroughline];',
	].join("\n"));
	run("node", ["node_modules/typescript/bin/tsc", "--strict", "--noEmit", "--skipLibCheck", "--module", "NodeNext", "--moduleResolution", "NodeNext", "--target", "ES2022", "--jsx", "react-jsx", "embed-typecheck.ts"], consumer);

	// Compile real MDX and render through its host component map, including
	// source that resembles JSX/expression syntax but must remain inert data.
	const mdx = [
		'import assert from "node:assert/strict";',
		'import { createElement } from "react";',
		'import * as runtime from "react/jsx-runtime";',
		'import { renderToString } from "react-dom/server";',
		'import { compile as compileMdx, run as runMdx } from "@mdx-js/mdx";',
		'import { remarkThroughline } from "@0xbuff/throughline/remark";',
		'import { ThroughlineEmbed } from "@0xbuff/throughline/react";',
		'const payload = \'</script><script>bad()</script> "{globalThis.__throughlineInjected = true}" \' + String.fromCharCode(96) + "backtick" + String.fromCharCode(96);',
		'const md = ["# Example", "", "~~~thl flow", \'node x "X" = 0\', \'step "Read"\', "  note " + JSON.stringify(payload), "~~~", "", "~~~js", "const other = 1", "~~~"].join("\\n");',
		'const mdxSource = String(await compileMdx(md, { remarkPlugins: [[remarkThroughline, { mode: "mdx" }]], outputFormat: "function-body" }));',
		'assert.equal(globalThis.__throughlineInjected, undefined);',
		'const { default: Content } = await runMdx(mdxSource, { ...runtime, baseUrl: import.meta.url });',
		'assert.throws(() => renderToString(createElement(Content, {})), /ThroughlineEmbed/);',
		'const html = renderToString(createElement(Content, { components: { ThroughlineEmbed } }));',
		'assert.match(html, /Visualization player/);',
		'assert.match(html, /const other = 1/);',
		'assert.doesNotMatch(html, /<script>/);',
		'assert.equal(globalThis.__throughlineInjected, undefined);',
		'const customSource = String(await compileMdx(md, { remarkPlugins: [[remarkThroughline, { mode: "mdx", componentName: "CustomTrace" }]], outputFormat: "function-body" }));',
		'const { default: CustomContent } = await runMdx(customSource, { ...runtime, baseUrl: import.meta.url });',
		'assert.match(renderToString(createElement(CustomContent, { components: { CustomTrace: ThroughlineEmbed } })), /Visualization player/);',
	].join("\n");
	run("node", ["--input-type=module", "-e", mdx], consumer);
	console.log("Packed Throughline passed Node-only, TypeScript, React SSR and MDX host checks.");
} finally {
	rmSync(scratch, { recursive: true, force: true });
}
