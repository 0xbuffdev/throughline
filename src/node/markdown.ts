/**
 * Offline Markdown/MDX code-node discovery for the Node CLI.
 *
 * The syntax tree comes from the same Remark/mdast parser family used by
 * framework hosts. Parsing does not transform, render, evaluate or execute
 * Markdown, HTML, JavaScript, JSX or MDX expressions.
 */
import remarkMdx from "remark-mdx";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { normalizeThlBody, ThroughlineAuthoringError } from "../v2/authoring.js";

export type MarkdownFence = Readonly<{
	lang: string | null;
	meta: string | null;
	body: string;
	line: number;
	column: number;
	ordinal: number | null;
}>;

export type MarkdownFormat = "md" | "mdx";
type MarkdownNode = Readonly<{
	type: string;
	children?: readonly MarkdownNode[];
	lang?: string | null;
	meta?: string | null;
	value?: string;
	position?: { start?: { line: number; column: number } };
}>;

const MAX_MARKDOWN_BYTES = 4 * 1024 * 1024;
const MAX_AST_NODES = 100_000;
const MAX_FENCES = 10_000;
const MAX_AST_DEPTH = 128;
const markdown = unified().use(remarkParse);
const mdx = unified().use(remarkParse).use(remarkMdx);

/**
 * Enumerate actual mdast `code` nodes in depth-first document order.
 *
 * Remark and this function count only nodes whose language is exactly
 * `thl`, including those with unsupported metadata (which `thl check`
 * later rejects). Other fences have a null ordinal. The node value and
 * source position come from the parser rather than from delimiters guessed
 * by line scanning. This includes arbitrary list/blockquote nesting and
 * excludes code-like text inside HTML, JSX, comments or indented code.
 */
export function scanMarkdownFences(
	source: string,
	options: Readonly<{ format?: MarkdownFormat }> = {},
): readonly MarkdownFence[] {
	if (typeof source !== "string" ||
		Buffer.byteLength(source, "utf8") > MAX_MARKDOWN_BYTES)
		throw new ThroughlineAuthoringError("THL_SYNTAX", "Markdown/MDX source exceeds 4 MiB or is not UTF-8 text");
	const format = options.format ?? "md";
	if (format !== "md" && format !== "mdx")
		throw new ThroughlineAuthoringError("THL_SYNTAX", "format must be md or mdx");

	const normalized = normalizeThlBody(source);
	let tree: MarkdownNode;
	try {
		tree = (format === "mdx" ? mdx : markdown).parse(normalized) as MarkdownNode;
	} catch (error) {
		// Do not reflect arbitrary untrusted input or filesystem paths from
		// parser errors; preserve only bounded, precise source coordinates.
		const point = error as { line?: unknown; column?: unknown; place?: { start?: { line?: unknown; column?: unknown } } };
		const line = point.line ?? point.place?.start?.line;
		const column = point.column ?? point.place?.start?.column;
		const at = Number.isSafeInteger(line) && Number.isSafeInteger(column) &&
			(line as number) > 0 && (column as number) > 0
			? " at " + line + ":" + column : "";
		throw new ThroughlineAuthoringError("THL_SYNTAX", "invalid " + format.toUpperCase() + " syntax" + at);
	}

	const fences: MarkdownFence[] = [];
	let ordinal = 0;
	let visited = 0;
	const pending: Array<{ node: MarkdownNode; depth: number }> = [{ node: tree, depth: 0 }];
	while (pending.length) {
		const { node, depth } = pending.pop()!;
		if (++visited > MAX_AST_NODES || depth > MAX_AST_DEPTH)
			throw new ThroughlineAuthoringError("THL_LIMIT", "Markdown/MDX AST exceeds work or depth budget");
		if (node.type === "code") {
			if (fences.length >= MAX_FENCES)
				throw new ThroughlineAuthoringError("THL_LIMIT", "too many Markdown/MDX code nodes");
			const position = node.position?.start;
			if (!position || !Number.isSafeInteger(position.line) ||
				!Number.isSafeInteger(position.column) ||
				position.line < 1 || position.column < 1)
				throw new ThroughlineAuthoringError("THL_SYNTAX", "code node lacks a valid source position");
			const isThl = node.lang === "thl";
			fences.push(Object.freeze({
				lang: node.lang ?? null,
				meta: node.meta ?? null,
				body: node.value ?? "",
				line: position.line,
				column: position.column,
				ordinal: isThl ? ordinal++ : null,
			}));
		}
		if (node.children) {
			for (let i = node.children.length - 1; i >= 0; i--)
				pending.push({ node: node.children[i], depth: depth + 1 });
		}
	}
	return Object.freeze(fences);
}
