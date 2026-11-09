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
	name?: string | null;
	attributes?: Array<{ type: "mdxJsxAttribute"; name: string; value: string }>;
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

export type ThroughlineRemarkOptions =
	| { mode?: "validate" }
	| { mode: "mdx"; componentName?: string };

const validPoint = (point: Point | undefined): point is Point =>
	point !== undefined &&
	Number.isSafeInteger(point.line) &&
	point.line > 0 &&
	Number.isSafeInteger(point.column) &&
	point.column > 0;

/**
 * Validate every `thl <domain>` code fence in an mdast document.
 *
 * Opt-in MDX mode replaces validated fences with JSX nodes containing only
 * literal attributes. The host registers the component; nothing is evaluated.
 */
export function remarkThroughline(options: ThroughlineRemarkOptions = {}) {
	if (options === null || typeof options !== "object" || Array.isArray(options)) {
		throw new TypeError('remarkThroughline expects { mode: "validate" | "mdx" }.');
	}
	const mode = options.mode ?? "validate";
	if (
		(mode !== "validate" && mode !== "mdx") ||
		Object.keys(options).some(
			(key) => key !== "mode" && !(mode === "mdx" && key === "componentName"),
		)
	) {
		throw new TypeError('remarkThroughline expects { mode: "validate" | "mdx" }.');
	}
	const componentName =
		mode === "mdx" && "componentName" in options
			? options.componentName ?? "ThroughlineEmbed"
			: "ThroughlineEmbed";
	// Disallow expressions, namespaces and intrinsic HTML element names.
	if (
		mode === "mdx" &&
		(typeof componentName !== "string" ||
			componentName.length > 128 ||
			!/^[A-Z][A-Za-z0-9_]*$/.test(componentName))
	) {
		throw new TypeError(
			"componentName must be a capitalized React component identifier.",
		);
	}

	return (tree: MarkdownRoot, file: DiagnosticFile): void => {
		const markdownLines = typeof file.value === "string"
			? file.value.split(/\r\n?|\n/)
			: undefined;
		// Delay writes until all blocks validate: no partial MDX on error.
		const replacements: Array<{
			siblings: readonly MarkdownNode[];
			index: number;
			node: MarkdownNode;
		}> = [];
		const visit = (
			node: MarkdownNode,
			siblings?: readonly MarkdownNode[],
			index?: number,
		): void => {
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
					if (mode === "mdx") {
						if (!siblings || index === undefined)
							throw new TypeError("Throughline code node has no Markdown parent.");
						replacements.push({
							siblings,
							index,
							node: {
								type: "mdxJsxFlowElement",
								name: componentName,
								attributes: [{
									type: "mdxJsxAttribute",
									name: "source",
									value: ["thl " + domain, body].join("\n"),
								}],
								children: [],
								...(node.position ? { position: node.position } : {}),
							},
						});
					}
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
			for (const [childIndex, child] of (node.children ?? []).entries())
				visit(child, node.children, childIndex);
		};
		visit(tree);
		for (const { siblings, index, node } of replacements)
			(siblings as MarkdownNode[])[index] = node;
	};
}

export default remarkThroughline;
