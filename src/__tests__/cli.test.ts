import {
	mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import remarkMdx from "remark-mdx";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { runCli } from "../cli/commands.js";
import { createNodeThroughlineHost, scanMarkdownFences, TrustedContentRoot } from "../node/index.js";
import { resolveThlBody, sha256Text, type SidecarManifest } from "../index.js";

const folders: string[] = [];
function root(): string {
	const folder = mkdtempSync(join(tmpdir(), "throughline-cli-"));
	folders.push(folder);
	return folder;
}
afterEach(() => {
	for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
});
const counter = (id = "counter") => JSON.stringify({
	schemaVersion: 2, id,
	origins: [{ id: "author", kind: "authored" }],
	entities: [{ id: "counter", label: "Counter" }], relations: [],
	initialState: { counter: { status: "known", value: 0 } },
	steps: [{ id: "increment", label: "Increment", events: [
		{ id: "update", type: "write", originId: "author",
			entityId: "counter", path: [], value: { status: "known", value: 1 } },
	] }],
});
function capture(argv: string[]): { status: number; out: string; err: string } {
	const out: string[] = [], err: string[] = [];
	const status = runCli(argv, {
		out: line => out.push(line), err: line => err.push(line),
	});
	return { status, out: out.join("\n"), err: err.join("\n") };
}
function fixture() {
	const directory = root();
	mkdirSync(join(directory, "docs"));
	mkdirSync(join(directory, "artifacts"));
	writeFileSync(join(directory, "artifacts", "counter.json"), counter());
	writeFileSync(join(directory, "docs", "intro.mdx"), [
		"# Example", "", "Some **normal Markdown** and math $x + y$.", "",
		"~~~javascript", "console.log('not executed')", "~~~", "",
		"~~~thl", "Explain the counter.\r\nShow its explicit writes.", "~~~", "",
		"~~~mermaid", "graph TD; A-->B", "~~~", "",
		"~~~thl", counter(), "~~~",
	].join("\n"));
	return directory;
}
function approve(directory: string) {
	const path = join(directory, "manifest.json");
	const source = JSON.parse(readFileSync(path, "utf8")) as SidecarManifest;
	writeFileSync(path, JSON.stringify({
		...source, entries: source.entries.map(entry => ({ ...entry, review: "reviewed" })),
	}, null, 2));
}

describe("TL-U10 CLI / source and sidecar boundary", () => {
	it("runs all three commands, fails closed until review and keeps deterministic locator hashes", () => {
		const directory = fixture();
		const base = ["--root", directory];
		const valid = capture(["validate", "artifacts/counter.json", ...base]);
		expect(valid.status).toBe(0);
		expect(valid.out).toMatch(/THL_OK validate.*schema=2.*steps=1.*sha256=[0-9a-f]{64}/);
		const jsonOnly = capture(["check", "docs/intro.mdx", ...base]);
		expect(jsonOnly.status).toBe(1);
		expect(jsonOnly.err).toMatch(/THL_UNRESOLVED.*docs\/intro.mdx:9:1 thl #0/);
		const materialized = capture(["materialize", "--document", "docs/intro.mdx",
			"--ordinal", "0", "--artifact", "artifacts/counter.json",
			"--manifest", "manifest.json", ...base]);
		expect(materialized.status).toBe(0);
		expect(materialized.out).toMatch(/THL_UNREVIEWED materialize/);
		let manifest = JSON.parse(readFileSync(join(directory, "manifest.json"), "utf8")) as SidecarManifest;
		expect(manifest.entries).toHaveLength(1);
		expect(manifest.entries[0].document).toBe("docs/intro.mdx");
		expect(manifest.entries[0].ordinal).toBe(0);
		expect(manifest.entries[0].review).toBe("unreviewed");
		expect(manifest.entries[0].intentSha256)
			.toBe(sha256Text("Explain the counter.\nShow its explicit writes."));
		const unreviewed = capture(["check", "docs", "--manifest", "manifest.json", ...base]);
		expect(unreviewed.status).toBe(1);
		expect(unreviewed.err).toMatch(/THL_UNREVIEWED/);
		approve(directory);
		const checked = capture(["check", ".", "--manifest", "manifest.json", ...base]);
		expect(checked.status).toBe(0);
		expect(checked.out).toMatch(/checked 1 document\(s\), 2 thl block\(s\)/);
		expect(checked.out).toMatch(/thl #1/);
		const host = createNodeThroughlineHost({ root: directory, manifestPath: "manifest.json" });
		const relative = host.documentForFile(join(directory, "docs", "intro.mdx"));
		expect(relative).toBe("docs/intro.mdx");
		expect(resolveThlBody("Explain the counter.\r\nShow its explicit writes.", {
			document: relative, ordinal: 0, manifest: host.manifest,
			loadArtifact: host.loadArtifact,
		}).id).toBe("counter");
		// A second materialization must invalidate a prior review.
		expect(capture(["materialize", "--document", "docs/intro.mdx",
			"--ordinal", "0", "--artifact", "artifacts/counter.json",
			"--manifest", "manifest.json", ...base]).status).toBe(0);
		manifest = JSON.parse(readFileSync(join(directory, "manifest.json"), "utf8")) as SidecarManifest;
		expect(manifest.entries[0].review).toBe("unreviewed");
	});

	it("keeps unrelated Markdown/Math/Mermaid outside the thl ordinal contract", () => {
		const markdown = [
			"~~~mdx", "text", "~~~", "",
			"> ~~~thl", "> Explain nested quote.", "> ~~~", "",
			"- ~~~thl", "  Explain nested list.", "  ~~~", "",
			"    ~~~thl", "    Continuation nested in the list.", "    ~~~", "",
			"~~~thl binary", "meta is unsupported", "~~~", "",
			"~~~mermaid", "graph TD", "~~~",
		].join("\n");
		const nodes = scanMarkdownFences(markdown);
		expect(nodes.filter(node => node.lang === "thl")
			.map(node => [node.ordinal, node.body])).toEqual([
			[0, "Explain nested quote."], [1, "Explain nested list."],
			[2, "Continuation nested in the list."],
			[3, "meta is unsupported"],
		]);
		expect(nodes.filter(node => node.lang === "mermaid")).toHaveLength(1);
		const directory = fixture();
		writeFileSync(join(directory, "docs", "nested.mdx"), markdown);
		const result = capture(["check", "docs/nested.mdx", "--root", directory]);
		expect(result.err).toMatch(/THL_UNRESOLVED.*thl #0/);
	});


	it("finds deeply nested CommonMark code nodes in exact depth-first order; ignores HTML comments and code-like text", () => {
		const input = [
			"# Real Markdown", "",
			"<!--", "~~~thl", "A comment is not a code node.", "~~~", "-->", "",
			"- Parent", "  - Child", "",
			"    ~~~thl", "    Explain the nested system.", "    ~~~", "",
			"~~~javascript", "const fake = String.raw`~~~thl`;", "~~~", "",
			"> ~~~thl", "> Explain the quoted system.", "> ~~~", "",
			"~~~thl", "Explain the final system.", "~~~", "",
			"    ~~~thl", "    Indented literal text, not a fence", "    ~~~",
		].join("\n");
		const nodes = scanMarkdownFences(input, { format: "md" });
		expect(nodes.filter(node => node.lang === "thl")
			.map(node => [node.ordinal, node.line, node.column, node.body]))
			.toEqual([
				[0, 12, 5, "Explain the nested system."],
				[1, 20, 3, "Explain the quoted system."],
				[2, 24, 1, "Explain the final system."],
			]);
		// Compare with an independent traversal of the parser's actual mdast.
		const tree = unified().use(remarkParse).parse(input);
		const expected: Array<{ value?: string; line?: number; column?: number }> = [];
		const visit = (node: { type: string; children?: readonly unknown[];
			lang?: string | null; value?: string;
			position?: { start: { line: number; column: number } } }): void => {
			if (node.type === "code" && node.lang === "thl")
				expected.push({
					value: node.value,
					line: node.position?.start.line,
					column: node.position?.start.column,
				});
			for (const child of node.children ?? [])
				visit(child as typeof node);
		};
		visit(tree);
		expect(nodes.filter(node => node.lang === "thl")
			.map(node => ({ value: node.body, line: node.line, column: node.column })))
			.toEqual(expected);

		const directory = fixture();
		writeFileSync(join(directory, "docs", "deep.md"), input);
		const checked = capture(["check", "docs/deep.md", "--root", directory]);
		expect(checked.status).toBe(1);
		expect(checked.err).toMatch(/THL_UNRESOLVED.*docs\/deep.md:12:5 thl #0/);
		const materialized = capture(["materialize", "--document", "docs/deep.md",
			"--ordinal", "0", "--artifact", "artifacts/counter.json",
			"--manifest", "manifest.json", "--root", directory]);
		expect(materialized.status).toBe(0);
		const saved = JSON.parse(readFileSync(join(directory, "manifest.json"), "utf8")) as SidecarManifest;
		expect(saved.entries).toHaveLength(1);
		expect(saved.entries[0].ordinal).toBe(0);
		expect(saved.entries[0].intentSha256).toBe(sha256Text("Explain the nested system."));
		const second = capture(["materialize", "--document", "docs/deep.md",
			"--ordinal", "1", "--artifact", "artifacts/counter.json",
			"--manifest", "manifest.json", "--root", directory]);
		expect(second.status).toBe(0);
		const updated = JSON.parse(readFileSync(join(directory, "manifest.json"), "utf8")) as SidecarManifest;
		expect(updated.entries.map(entry => entry.ordinal)).toEqual([0, 1]);
	});

	it("uses a non-evaluating MDX AST; excludes expression-like fake fences and preserves nested JSX codes", () => {
		const input = [
			"# MDX", "",
			"{/*", "~~~thl", "This is an MDX expression comment.", "~~~", "*/}", "",
			"<Example title={'~~~thl'}>", "",
			"  ~~~thl",
			"  Explain the real JSX-child model.",
			"  ~~~", "",
			"</Example>", "",
			"~~~thl",
			"Explain another valid block.",
			"~~~",
		].join("\n");
		const nodes = scanMarkdownFences(input, { format: "mdx" })
			.filter(node => node.lang === "thl");
		const tree = unified().use(remarkParse).use(remarkMdx).parse(input);
		const expected: string[] = [];
		const traverse = (node: { type: string; children?: readonly unknown[];
			lang?: string | null; value?: string }): void => {
			if (node.type === "code" && node.lang === "thl")
				expected.push(node.value ?? "");
			for (const child of node.children ?? [])
				traverse(child as typeof node);
		};
		traverse(tree);
		expect(nodes.map(node => node.body)).toEqual(expected);
		expect(nodes.map(node => node.ordinal)).toEqual([0, 1]);
		expect(nodes.map(node => node.body)).toEqual([
			"Explain the real JSX-child model.",
			"Explain another valid block.",
		]);
		const directory = fixture();
		writeFileSync(join(directory, "docs", "jsx.mdx"), input);
		const check = capture(["check", "docs/jsx.mdx", "--root", directory]);
		expect(check.status).toBe(1);
		expect(check.err).toMatch(/THL_UNRESOLVED.*docs\/jsx.mdx:11:3 thl #0/);
	});

	it("does not mistake Markdown HTML comments for unresolved prose", () => {
		const directory = fixture();
		const commented = [
			"<!--", "~~~thl", "A fake comment fence.", "~~~", "-->", "",
			"# A normal document",
			"~~~js", "console.log('no code execution')", "~~~",
		].join("\n");
		writeFileSync(join(directory, "docs", "comments.md"), commented);
		expect(scanMarkdownFences(commented, { format: "md" })
			.some(node => node.lang === "thl")).toBe(false);
		const check = capture(["check", "docs/comments.md", "--root", directory]);
		expect(check.status).toBe(0);
		expect(check.out).toMatch(/checked 1 document\(s\), 0 thl block\(s\)/);
		const materialize = capture(["materialize", "--document", "docs/comments.md",
			"--ordinal", "0", "--artifact", "artifacts/counter.json",
			"--manifest", "manifest.json", "--root", directory]);
		expect(materialize.status).toBe(1);
		expect(materialize.err).toMatch(/THL_UNRESOLVED.*thl #0 does not exist/);
	});

	it("fails closed on malformed MDX syntax instead of silently reporting zero fences", () => {
		const directory = fixture();
		writeFileSync(join(directory, "docs", "broken.mdx"), "{not a valid mdx expression");
		const check = capture(["check", "docs/broken.mdx", "--root", directory]);
		expect(check.status).toBe(1);
		expect(check.err).toMatch(/THL_SYNTAX.*invalid MDX syntax/);
	});

	it("rejects stale edits, mismatched artifact digests, duplicate locators and metadata", () => {
		const directory = fixture();
		const base = ["--root", directory];
		const make = () => capture(["materialize", "--document", "docs/intro.mdx",
			"--ordinal", "0", "--artifact", "artifacts/counter.json",
			"--manifest", "manifest.json", ...base]);
		expect(make().status).toBe(0);
		approve(directory);
		const md = join(directory, "docs", "intro.mdx");
		const original = readFileSync(md, "utf8");
		writeFileSync(md, original.replace("Explain the counter.", "Explain a changed counter."));
		expect(capture(["check", "docs/intro.mdx", "--manifest", "manifest.json", ...base]).err)
			.toMatch(/THL_DIGEST.*docs\/intro.mdx/);
		writeFileSync(md, original);
		writeFileSync(join(directory, "artifacts", "counter.json"), counter("different"));
		expect(capture(["check", "docs/intro.mdx", "--manifest", "manifest.json", ...base]).err)
			.toMatch(/THL_DIGEST/);
		writeFileSync(join(directory, "artifacts", "counter.json"), counter());
		const manifest = JSON.parse(readFileSync(join(directory, "manifest.json"), "utf8")) as SidecarManifest;
		writeFileSync(join(directory, "manifest.json"), JSON.stringify({
			version: 1, entries: [manifest.entries[0], manifest.entries[0]],
		}));
		expect(capture(["check", "docs/intro.mdx", "--manifest", "manifest.json", ...base]).err)
			.toMatch(/THL_MANIFEST.*duplicate/);
		writeFileSync(join(directory, "manifest.json"), '{"version":1,"version":1,"entries":[]}');
		expect(capture(["check", "docs/intro.mdx", "--manifest", "manifest.json", ...base]).err)
			.toMatch(/THL_ARTIFACT_SYNTAX.*duplicate object key/);
		writeFileSync(md, original.replace("~~~thl\n", "~~~thl flow\n"));
		expect(capture(["check", "docs/intro.mdx", ...base]).err).toMatch(/THL_SYNTAX.*metadata/);
	});

	it("rejects traversal, absolute artifact paths and symlink escapes without leaking contents", () => {
		const directory = fixture();
		const outside = root();
		writeFileSync(join(outside, "sensitive.json"), counter("private"));
		symlinkSync(outside, join(directory, "escape"));
		const base = ["--root", directory];
		for (const attempt of [
			["validate", "../sensitive.json", ...base],
			["validate", "/tmp/sensitive.json", ...base],
			["validate", "escape/sensitive.json", ...base],
			["materialize", "--document", "docs/intro.mdx", "--ordinal", "0",
				"--artifact", "escape/sensitive.json", "--manifest", "manifest.json", ...base],
		]) {
			const result = capture(attempt);
			expect(result.status).toBe(1);
			expect(result.err).toMatch(/THL_PATH|THL_IO/);
			expect(result.err).not.toContain("private");
		}
		expect(() => createNodeThroughlineHost({ root: directory,
			manifestPath: "escape/sensitive.json" })).toThrow(/THL_PATH/);
		expect(() => new TrustedContentRoot(directory).relativeForFile(
			join(outside, "sensitive.json"))).toThrow(/THL_PATH/);
	});

	it("rejects unsupported JSON and destructive or incomplete arguments with stable codes", () => {
		const directory = fixture();
		const artifact = join(directory, "artifacts", "counter.json");
		const base = ["--root", directory];
		const cases = [
			['{"schemaVersion":1}', "THL_ARTIFACT_VERSION"],
			['{"schemaVersion":2,"schemaVersion":2}', "THL_ARTIFACT_SYNTAX"],
			['{"schemaVersion":2}', "THL_ARTIFACT_SHAPE"],
		] as const;
		for (const [text, code] of cases) {
			writeFileSync(artifact, text);
			expect(capture(["validate", "artifacts/counter.json", ...base]).err).toContain(code);
		}
		expect(capture(["materialize", "--document", "docs/intro.mdx",
			"--ordinal", "-1", "--artifact", "artifacts/counter.json",
			"--manifest", "manifest.json", ...base]).err).toContain("THL_USAGE");
		expect(capture(["materialize", "--document", "docs/intro.mdx", ...base]).err)
			.toContain("THL_USAGE");
		expect(capture(["nonsense", ...base]).err).toContain("THL_USAGE");
	});
});
