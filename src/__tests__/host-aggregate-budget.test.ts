import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import remarkMdx from "remark-mdx";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { ARTIFACT_LIMITS, artifactSha256, serializeArtifact, sha256Text, type VisualArtifact } from "../index.js";
import { runCli } from "../cli/commands.js";
import { remarkThroughline } from "../remark/index.js";

const document = "lesson.mdx";
const prompt = "Explain the counter.";
const limit = 32 * 1024 * 1024;
const artifact: VisualArtifact = {
	schemaVersion: 2, id: "counter", title: "",
	origins: [{ id: "author", kind: "authored" }],
	entities: [{ id: "counter", label: "Counter" }], relations: [],
	initialState: { counter: { status: "known", value: 0 } }, steps: [],
};
// Exactly 4 MiB canonical, so eight references hit the aggregate ceiling
// and the ninth is the first overflow. Source Markdown remains small.
artifact.title = "x".repeat(ARTIFACT_LIMITS.artifactBytes - Buffer.byteLength(serializeArtifact(artifact)));
const text = serializeArtifact(artifact);
const digest = artifactSha256(artifact);
const manifest = {
	version: 1,
	entries: Array.from({ length: 9 }, (_, ordinal) => ({
		document, ordinal, artifactPath: "counter.json",
		intentSha256: sha256Text(prompt), artifactSha256: digest, review: "reviewed",
	})),
};
function source(count: number): string {
	return Array.from({ length: count }, () => ["~~~thl", prompt, "~~~", ""].join("\n")).join("\n");
}
const parser = unified().use(remarkParse).use(remarkMdx);

it("enforces identical aggregate artifact admission at the exact ceiling in CLI and Remark", () => {
	expect(Buffer.byteLength(text) * 8).toBe(limit);
	expect(Buffer.byteLength(text) * 9).toBeGreaterThan(limit);
	const root = mkdtempSync(join(tmpdir(), "throughline-aggregate-"));
	try {
		writeFileSync(join(root, "counter.json"), text);
		writeFileSync(join(root, "manifest.json"), JSON.stringify(manifest));
		for (const count of [8, 9]) {
			const markdown = source(count);
			writeFileSync(join(root, document), markdown);
			const out: string[] = [], err: string[] = [];
			const status = runCli(["check", document, "--manifest", "manifest.json", "--root", root],
				{ out: line => out.push(line), err: line => err.push(line) });
			if (count === 8) {
				expect(status).toBe(0);
				expect(err).toEqual([]);
				expect(out.at(-1)).toMatch(/checked 1 document\(s\), 8 thl block\(s\)/);
			} else {
				expect(status).toBe(1);
				expect(err.join("\n")).toContain("THL_LIMIT: lesson.mdx:33:1 thl #8:");
				expect(err.join("\n")).toContain("resolved artifact byte budget exceeded");
				expect(out).toHaveLength(8);
			}
			for (const mode of ["validate", "mdx"] as const) {
				const tree = parser.parse(markdown);
				const original = structuredClone(tree);
				let loads = 0;
				const transform = remarkThroughline({ mode, manifest, loadArtifact: () => { loads++; return text; } });
				const file = {
					path: document,
					fail: (message: string, data?: { place?: { line: number; column: number }; ruleId?: string }): never => {
						throw Object.assign(new Error(message), { code: data?.ruleId, ...data?.place });
					},
				};
				if (count === 8) {
					transform(tree as Parameters<typeof transform>[0], file);
					if (mode === "validate") expect(tree).toEqual(original);
					else {
						expect(tree.children.map(node => node.type)).toEqual(Array(8).fill("mdxJsxFlowElement"));
					}
				} else {
					try {
						transform(tree as Parameters<typeof transform>[0], file);
						throw new Error("expected aggregate rejection");
					} catch (error) {
						expect(error).toMatchObject({ code: "THL_LIMIT", line: 33, column: 1,
							message: expect.stringMatching(/thl #8.*resolved artifact byte budget exceeded/) });
					}
					expect(tree).toEqual(original);
				}
				expect(loads).toBe(count);
			}
		}
	} finally { rmSync(root, { recursive: true, force: true }); }
}, 120_000);
