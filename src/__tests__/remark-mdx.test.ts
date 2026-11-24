import { describe, expect, it } from "vitest";
import { remarkThroughline } from "../remark/index.js";
import { artifactSha256, sha256Text, type VisualArtifact } from "../index.js";

const artifact = (): VisualArtifact => ({
	schemaVersion: 2, id: "demo", origins: [{ id: "o", kind: "authored" }],
	entities: [{ id: "node", label: "Node" }], relations: [],
	initialState: { node: { status: "known", value: 0 } }, steps: [],
});
const json = () => JSON.stringify(artifact());
type Node = {
	type: string; lang?: string | null; meta?: string | null; value?: string;
	children?: Node[]; name?: string | null;
	attributes?: Array<{ type: "mdxJsxAttribute"; name: string; value: string }>;
	position?: { start: { line: number; column: number } };
};
const code = (value: string, line = 1): Node => ({
	type: "code", lang: "thl", value,
	position: { start: { line, column: 1 } },
});
const file = {
	path: "lessons/demo.mdx",
	fail: (reason: string): never => { throw new Error(reason); },
};

describe("TL-U08 inert MDX host projection", () => {
	it("replaces only validated thl nodes, using literal schema-2 artifacts", () => {
		const original = code(json(), 4);
		const unrelated: Node = { type: "code", lang: "javascript", value: "const a = 1" };
		const tree: Node = { type: "root", children: [
			{ type: "blockquote", children: [original] }, unrelated, code(json(), 9),
		] };
		remarkThroughline({ mode: "mdx" })(tree as { type: string; children: Node[] }, file);
		for (const node of [tree.children![0].children![0], tree.children![2]]) {
			expect(node.type).toBe("mdxJsxFlowElement");
			expect(node.name).toBe("ThroughlineEmbed");
			expect(node.attributes![0].name).toBe("artifactJson");
			expect(JSON.parse(node.attributes![0].value)).toEqual(JSON.parse(json()));
		}
		expect(tree.children![1]).toBe(unrelated);
		expect(tree.children![0].children![0].position).toEqual(original.position);
	});

	it("renders dangerous looking authored text as an inert string", () => {
		const source = artifact();
		source.title = "</script>{globalThis.__injected=true}";
		const tree: Node = { type: "root", children: [code(JSON.stringify(source))] };
		remarkThroughline({ mode: "mdx" })(tree as { type: string; children: Node[] }, file);
		const attribute = tree.children![0].attributes![0];
		expect(attribute.name).toBe("artifactJson");
		expect(typeof attribute.value).toBe("string");
		expect(attribute.value).toContain("__injected");
	});

	it("never partly transforms a document when a later fence fails", () => {
		const tree: Node = { type: "root", children: [code(json()), code("unresolved")] };
		const original = structuredClone(tree);
		expect(() => remarkThroughline({ mode: "mdx" })(tree as { type: string; children: Node[] }, file)).toThrow(/THL_UNRESOLVED/);
		expect(tree).toEqual(original);
	});

	it("counts ordinal among thl nodes only for reviewed prose", () => {
		const intent = "Explain explicit changes";
		const tree: Node = { type: "root", children: [
			code(json()), { type: "code", lang: "math", value: "x^2" }, code(intent),
		] };
		remarkThroughline({ mode: "mdx", manifest: { version: 1, entries: [{
			document: "lessons/demo.mdx", ordinal: 1,
			intentSha256: sha256Text(intent), artifactPath: "artifacts/demo.json",
			artifactSha256: artifactSha256(artifact()), review: "reviewed",
		}] }, loadArtifact: () => json() })(tree as { type: string; children: Node[] }, file);
		expect(tree.children![2].attributes![0].name).toBe("artifactJson");
	});

	it("validates custom component names and option keys", () => {
		const tree: Node = { type: "root", children: [code(json())] };
		remarkThroughline({ mode: "mdx", componentName: "CustomTrace_2" })(tree as { type: string; children: Node[] }, file);
		expect(tree.children![0].name).toBe("CustomTrace_2");
		for (const name of ["div", "Trace.Part", "Bad-Name", "Trace{value}", "", "A".repeat(129)])
			expect(() => remarkThroughline({ mode: "mdx", componentName: name })).toThrow(/componentName/);
		expect(() => remarkThroughline({ mode: "validate", componentName: "Bad" } as never))
			.toThrow(/options/);
	});
});


it.each(["groups", "claims", "views"])("enforces optional %s arrays atomically in Remark/MDX", key => {
	for (const mode of ["omitted", "empty", "null"] as const) {
		const input: Record<string, unknown> = { ...artifact() };
		if (mode !== "omitted") input[key] = mode === "empty" ? [] : null;
		const tree = { type: "root", children: [code(json(), 1), code(JSON.stringify(input), 5)] };
		const original = structuredClone(tree);
		if (mode === "null") {
			expect(() => remarkThroughline({ mode: "mdx" })(tree, file))
				.toThrow("THL_ARTIFACT");
			expect(() => remarkThroughline({ mode: "mdx" })(tree, file))
				.toThrow("$." + key + ": expected an array");
			expect(tree).toEqual(original);
		} else {
			remarkThroughline({ mode: "mdx" })(tree, file);
			expect(tree.children.map(node => node.type)).toEqual(["mdxJsxFlowElement", "mdxJsxFlowElement"]);
			const decoded = JSON.parse(tree.children[1].attributes![0].value);
			if (mode === "omitted") expect(decoded).not.toHaveProperty(key);
			else expect(decoded[key]).toEqual([]);
		}
	}
});
