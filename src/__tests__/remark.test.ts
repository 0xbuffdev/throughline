import { describe, expect, it } from "vitest";
import { remarkThroughline } from "../remark/index.js";

type Position = { start: { line: number; column: number } };
type Node = {
	type: string;
	lang?: string | null;
	meta?: string | null;
	value?: string;
	position?: Position;
	children?: Node[];
};
const FLOW = 'node counter "Counter" = 0\nstep "Read"\n  focus counter';
const code = (
	meta: string | null,
	value: string,
	line?: number,
): Node => ({
	type: "code",
	lang: "thl",
	meta,
	value,
	...(line === undefined
		? {}
		: { position: { start: { line, column: 1 } } }),
});

function validate(tree: Node) {
	const failures: Error[] = [];
	const file = {
		fail: (
			reason: string,
			options?: {
				place?: { line: number; column: number };
				source?: string;
				ruleId?: string;
			},
		): never => {
			const error = Object.assign(new Error(reason), options?.place, {
				source: options?.source,
				ruleId: options?.ruleId,
				file: "lesson.md",
			});
			failures.push(error);
			throw error;
		},
	};
	remarkThroughline()(tree as { type: string; children: Node[] }, file);
	return failures;
}

describe("remarkThroughline validation", () => {
	it("preserves nested and unrelated mdast nodes, including multiple fences", () => {
		const tree: Node = {
			type: "root",
			children: [
				{ type: "heading", children: [{ type: "text", value: "Demo" }] },
				{ type: "code", lang: "js", value: "invalid JS is not Throughline" },
				{
					type: "blockquote",
					children: [code("flow", FLOW, 4), code("binary", "a = 1\nb = 1", 9)],
				},
			],
		};
		const before = structuredClone(tree);
		expect(validate(tree)).toEqual([]);
		expect(tree).toEqual(before);
	});

	it("maps invalid source body lines to their original Markdown lines", () => {
		const tree = {
			type: "root",
			children: [code("flow", 'node x "X" = 0\ninvalid', 20)],
		};
		try {
			validate(tree);
			throw new Error("Expected failure");
		} catch (error) {
			expect(error).toMatchObject({
				line: 22,
				column: 1,
				file: "lesson.md",
				source: "@0xbuff/throughline",
				ruleId: "invalid-trace",
			});
			expect((error as Error).message).toMatch(/Expected node, link, or step/);
		}
	});

	it.each([null, "", "flow extra", "constructor"])(
		"rejects missing, extra or unsupported domain metadata: %s",
		(meta) => {
			expect(() => validate({ type: "root", children: [code(meta, FLOW, 7)] }))
				.toThrow(/domain|metadata/);
		},
	);

	it("does not invent a location when mdast has no position", () => {
		const tree = { type: "root", children: [code("flow", "not a statement")] };
		try {
			validate(tree);
			throw new Error("Expected failure");
		} catch (error) {
			expect(error).not.toHaveProperty("line");
			expect(error).not.toHaveProperty("column");
			expect((error as Error).message).not.toMatch(/Line 1:/);
			expect((error as Error).message).toMatch(/Expected node/);
		}
	});

	it("enforces source budgets on parser-owned code bodies", () => {
		expect(() =>
			validate({
				type: "root",
				children: [code("flow", "x".repeat(262_145), 3)],
			}),
		).toThrow(/source|limit|large|Maximum|exceeds/i);
	});

	it("does not recognize prose, other languages or indented code", () => {
		expect(
			validate({
				type: "root",
				children: [
					{ type: "paragraph", children: [{ type: "text", value: "thl flow" }] },
					{ type: "code", lang: "javascript", meta: "thl flow", value: "bad" },
					{ type: "code", lang: null, value: "thl flow\nbad" },
				],
			}),
		).toEqual([]);
	});

	it("rejects invalid options instead of silently enabling MDX", () => {
		expect(() => remarkThroughline({ mode: "mdx" } as never)).toThrow(
			/only/,
		);
		expect(() => remarkThroughline({ other: true } as never)).toThrow(
			/only/,
		);
	});
});
