import { compileAst, SUPPORTED_DOMAINS } from "../domains/registry.js";
import { checkSourceSize } from "../limits.js";
import { ProgramError } from "../model.js";

/**
 * Minimal, structural mdast/VFile contracts. No Remark, React or VFile
 * dependency is loaded (or required) by the published adapter.
 */
type MarkdownNode = {
	type: string;
	children?: readonly MarkdownNode[];
	lang?: string | null;
	meta?: string | null;
	value?: string;
	position?: { start: { line: number; column: number } };
};
type MarkdownRoot = { type: string; children: readonly MarkdownNode[] };
type Point = { line: number; column: number };
type DiagnosticFile = {
	/** Original Markdown when available for precise source columns. */
	value?: string | Uint8Array;
	fail: (
		reason: string,
		options?: { place?: Point; source?: string; ruleId?: string },
	) => never;
};

export type ThroughlineRemarkOptions = { mode?: "validate" };

const validPoint = (point: Point | undefined): point is Point =>
	point !== undefined &&
	Number.isSafeInteger(point.line) &&
	point.line > 0 &&
	Number.isSafeInteger(point.column) &&
	point.column > 0;

/**
 * Validate every `thl <domain>` code fence in an mdast document.
 *
 * This does not transform the AST, evaluate authored input, or import React.
 * MDX component transformation belongs to the separate opt-in integration.
 */
export function remarkThroughline(options: ThroughlineRemarkOptions = {}) {
	if (
		options === null ||
		typeof options !== "object" ||
		Array.isArray(options) ||
		Object.keys(options).some((key) => key !== "mode") ||
		(options.mode !== undefined && options.mode !== "validate")
	) {
		throw new TypeError(
			'remarkThroughline currently supports only { mode: "validate" }.',
		);
	}

	return (tree: MarkdownRoot, file: DiagnosticFile): void => {
		const markdownLines = typeof file.value === "string"
			? file.value.split(/\r\n?|\n/)
			: undefined;
		const visit = (node: MarkdownNode): void => {
			if (node.type === "code" && node.lang === "thl") {
				const start = node.position?.start;
				const positioned = validPoint(start);
				const headerLine = positioned ? start.line : undefined;
				const fail = (reason: string, place?: Point): never =>
					file.fail(reason, {
						...(place ? { place } : {}),
						source: "@0xbuff/throughline",
						ruleId: "invalid-trace",
					});

				// mdast strips blockquote/list prefixes and indentation from
				// code values. Locate the exact token in the original file,
				// or omit the clickable position if it cannot be verified.
				const bodyPosition = (line: number, lines: readonly string[]): Point | undefined => {
					if (!positioned || !markdownLines || line <= start.line) return undefined;
					const token = lines[line - start.line - 1]?.trim();
					const original = markdownLines[line - 1];
					if (!token || original === undefined) return undefined;
					const offset = original.indexOf(token);
					if (offset < 0 || original.lastIndexOf(token) !== offset) return undefined;
					return { line, column: offset + 1 };
				};
				const meta = node.meta?.trim() ?? "";
				const tokens = meta ? meta.split(/\s+/) : [];
				if (tokens.length !== 1) {
					fail(
						'Expected exactly one domain after "thl" (no extra metadata).',
						positioned ? start : undefined,
					);
				}
				const domain = tokens[0];
				if (!(SUPPORTED_DOMAINS as readonly string[]).includes(domain)) {
					fail(
						`Unknown Throughline domain "${domain}". Use ${SUPPORTED_DOMAINS.join(", ")}.`,
						positioned ? start : undefined,
					);
				}
				const body = node.value;
				if (typeof body !== "string") {
					return fail("Expected a Throughline code block body.", positioned ? start : undefined);
				}
				const lines = body.split(/\r\n?|\n/);
				try {
					// compileAst deliberately bypasses the fenced-source parser;
					// enforce the same input budget before splitting host-owned code.
					checkSourceSize(body.length + domain.length + 5);
					compileAst({
						kind: domain,
						lines,
						...(headerLine !== undefined ? { source: { line: headerLine } } : {}),
					});
				} catch (error) {
					if (!(error instanceof ProgramError)) throw error;
					// Semantic validation may report no source line (e.g. duplicate
					// IDs). It must never be presented as a fence-header error.
					const firstLine = error.diagnostics[0]?.line;
					const place =
						firstLine !== undefined &&
						Number.isSafeInteger(firstLine) &&
						firstLine > 0
							? bodyPosition(firstLine, lines)
							: undefined;
					// Core line 1 is block-relative without mdast positions.
					const reason =
						headerLine === undefined
							? error.message.replace(/(^|\\n)Line \\d+: /g, "$1")
							: error.message;
					return fail(reason, place);
				}
			}
			for (const child of node.children ?? []) visit(child);
		};
		visit(tree);
	};
}

export default remarkThroughline;
