import { describe, expect, it } from "vitest";
import { remarkThroughline } from "../remark/index.js";
import { artifactSha256, sha256Text, type VisualArtifact } from "../index.js";

const artifact = (): VisualArtifact => ({
	schemaVersion: 2, id: "demo", origins: [{ id: "o", kind: "authored" }],
	entities: [{ id: "node", label: "Node" }], relations: [],
	initialState: { node: { status: "known", value: 0 } },
	steps: [{ id: "one", label: "One", events: [
		{ id: "write", originId: "o", type: "write", entityId: "node",
			path: [], value: { status: "known", value: 1 } },
	] }],
});
const json = () => JSON.stringify(artifact());
type Node = {
	type: string; lang?: string | null; meta?: string | null; value?: string;
	children?: Node[]; position?: { start: { line: number; column: number } };
};
const code = (body: string, meta: string | null = null, line = 1): Node =>
	({ type: "code", lang: "thl", meta, value: body,
		position: { start: { line, column: 1 } } });
const file = {
	path: "lessons/demo.mdx",
	fail: (message: string, data?: { place?: { line: number; column: number }; ruleId?: string }): never => {
		throw Object.assign(new Error(message), data?.place ?? {}, { code: data?.ruleId });
	},
};

describe("TL-U08 Remark validation", () => {
	it("validates plain thl JSON, nested nodes and unrelated Markdown without mutations", () => {
		const tree: Node = { type: "root", children: [
			{ type: "code", lang: "js", meta: "thl flow", value: "not a trace" },
			{ type: "blockquote", children: [code(json(), null, 4)] },
			{ type: "code", lang: "mermaid", value: "graph LR" },
			code(json(), null, 10),
		] };
		const original = structuredClone(tree);
		remarkThroughline()(tree as { type: string; children: Node[] }, file);
		expect(tree).toEqual(original);
	});

	it("rejects domain metadata, empty bodies, malformed JSON, duplicate keys and wrapper", () => {
		for (const meta of ["flow", "binary", "matrix", "callstack", "bindings"]) {
			expect(() => remarkThroughline()(
				{ type: "root", children: [code(json(), meta)] }, file,
			)).toThrow(/THL_SYNTAX/);
		}
		for (const body of [" ", "{bad", '{"schemaVersion":2,"schemaVersion":2}',
			'{"documentVersion":1}', '{"schemaVersion":1}']) {
			expect(() => remarkThroughline()(
				{ type: "root", children: [code(body)] }, file,
			)).toThrow(/thl #0/);
		}
	});

	it("resolves only reviewed exact prose materializations and validates model", () => {
		const prompt = "Show the update.\r\nExplain explicit state.";
		const entry = {
			document: "lessons/demo.mdx", ordinal: 0,
			intentSha256: sha256Text(prompt.replace(/\r\n?/g, "\n")),
			artifactPath: "artifacts/demo.json", artifactSha256: artifactSha256(artifact()),
			review: "reviewed" as const,
		};
		const tree: Node = { type: "root", children: [code(prompt, null, 15)] };
		expect(() => remarkThroughline()(tree as { type: string; children: Node[] }, file)).toThrow(/THL_UNRESOLVED/);
		const loaded: string[] = [];
		const opts = { manifest: { version: 1, entries: [entry] },
			loadArtifact: (path: string) => { loaded.push(path); return json(); } };
		remarkThroughline(opts)(tree as { type: string; children: Node[] }, file);
		expect(loaded).toEqual(["artifacts/demo.json"]);
		expect(() => remarkThroughline({ ...opts, manifest: { version: 1,
			entries: [{ ...entry, intentSha256: sha256Text("stale") }] } })(tree as { type: string; children: Node[] }, file))
			.toThrow(/THL_DIGEST/);
		expect(() => remarkThroughline({ ...opts, manifest: { version: 1,
			entries: [{ ...entry, review: "unreviewed" }] } })(tree as { type: string; children: Node[] }, file))
			.toThrow(/THL_UNREVIEWED/);
	});

	it("assigns thl-only ordinals and retains verified source line", () => {
		const tree: Node = { type: "root", children: [
			{ type: "code", lang: "javascript", value: "one" },
			{ type: "blockquote", children: [code(json(), null, 4)] },
			code("{bad", null, 23),
		] };
		try {
			remarkThroughline()(tree as { type: string; children: Node[] }, file);
			throw new Error("Expected error");
		} catch (error) {
			expect((error as Error).message).toMatch(/thl #1 in lessons\/demo.mdx/);
			expect(error).toMatchObject({ line: 23, column: 1, code: "THL_ARTIFACT" });
		}
	});

	it("does not invent positions and rejects unsupported options", () => {
		const tree: Node = { type: "root", children: [{ type: "code", lang: "thl", value: "unresolved" }] };
		try { remarkThroughline()(tree as { type: string; children: Node[] }, file); }
		catch (error) {
			expect(error).not.toHaveProperty("line");
			expect(error).not.toHaveProperty("column");
		}
		expect(() => remarkThroughline({ mode: "unknown" } as never)).toThrow(/options/);
	});
});
