import { describe, expect, it } from "vitest";
import { remarkThroughline } from "../remark/index.js";

type MdNode = {
	type: string;
	lang?: string | null;
	meta?: string | null;
	value?: string;
	name?: string | null;
	attributes?: Array<{ type: string; name: string; value: string }>;
	children?: MdNode[];
	position?: { start: { line: number; column: number } };
};
const flow = 'node counter "Counter" = 0\nstep "Read"\n  focus counter';
const code = (body: string, meta = "flow"): MdNode => ({
	type: "code",
	lang: "thl",
	meta,
	value: body,
	position: { start: { line: 4, column: 3 } },
});
const file = {
	fail: (reason: string): never => { throw new Error(reason); },
};

describe("remarkThroughline MDX mode", () => {
	it("replaces only trace fences with literal source attributes and preserves positions", () => {
		const original = code(flow);
		const untouched = { type: "code", lang: "ts", value: "const a = 1" };
		const tree: MdNode = {
			type: "root",
			children: [
				{ type: "heading", children: [{ type: "text", value: "Example" }] },
				{ type: "blockquote", children: [original] },
				untouched,
				code("a = 1\nb = 1", "binary"),
			],
		};
		remarkThroughline({ mode: "mdx" })(tree as { type: string; children: MdNode[] }, file);
		const nested = tree.children![1].children![0];
		expect(nested).toMatchObject({
			type: "mdxJsxFlowElement",
			name: "ThroughlineEmbed",
			attributes: [{ type: "mdxJsxAttribute", name: "source", value: "thl flow\n" + flow }],
			children: [],
			position: original.position,
		});
		expect(tree.children![2]).toBe(untouched);
		expect(tree.children![3]).toMatchObject({
			type: "mdxJsxFlowElement",
			attributes: [{ value: "thl binary\na = 1\nb = 1" }],
		});
	});

	it("holds quotes, JSX, braces, script text, backticks and newlines as literal data", () => {
		const injection = [
			'</script><script>alert("bad")</script>',
			'{globalThis.__throughlineInjected = true}',
			String.fromCharCode(96) + "code" + String.fromCharCode(96),
			"line\\nmore",
		].join(" ");
		const body = flow + "\n  note " + JSON.stringify(injection);
		const tree: MdNode = { type: "root", children: [code(body)] };
		remarkThroughline({ mode: "mdx" })(tree as { type: string; children: MdNode[] }, file);
		const node = tree.children![0];
		expect(node.attributes).toEqual([
			{ type: "mdxJsxAttribute", name: "source", value: "thl flow\n" + body },
		]);
		expect(node.attributes![0].value).toContain(injection.slice(0, 9));
		expect(node.attributes!.every((attr) => typeof attr.value === "string")).toBe(true);
	});

	it("never partially transforms a document if a later fence fails", () => {
		const tree: MdNode = { type: "root", children: [code(flow), code("invalid")] };
		const before = structuredClone(tree);
		expect(() =>
			remarkThroughline({ mode: "mdx" })(tree as { type: string; children: MdNode[] }, file),
		).toThrow(/Expected node/);
		expect(tree).toEqual(before);
	});

	it("accepts a custom component identifier and rejects invalid names and options", () => {
		const tree: MdNode = { type: "root", children: [code(flow)] };
		remarkThroughline({ mode: "mdx", componentName: "CustomTrace_2" })(
			tree as { type: string; children: MdNode[] },
			file,
		);
		expect(tree.children![0].name).toBe("CustomTrace_2");
		for (const name of ["div", "Trace.Part", "Bad-Name", "Trace{value}", "", "A".repeat(129)]) {
			expect(() => remarkThroughline({ mode: "mdx", componentName: name }))
				.toThrow(/componentName/);
		}
		expect(() => remarkThroughline({ mode: "validate", componentName: "Bad" } as never))
			.toThrow(/mode/);
	});
});
