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
		const visit = (node: MarkdownNode): void => {
			if (node.type === "code" && node.lang === "thl") {
				const start = node.position?.start;
				const positioned = validPoint(start);
				const headerLine = positioned ? start.line : undefined;
				const fail = (reason: string, line?: number): never => {
					const place =
						positioned
							? {
									line:
										line !== undefined && Number.isSafeInteger(line) && line > 0
											? line
											: start.line,
									column: line === undefined || line === start.line
										? start.column
										: 1,
								}
							: undefined;
					return file.fail(reason, {
						...(place ? { place } : {}),
						source: "@0xbuff/throughline",
						ruleId: "invalid-trace",
					});
				};
				const meta = node.meta?.trim() ?? "";
				const tokens = meta ? meta.split(/\s+/) : [];
				if (tokens.length !== 1) {
					fail(
						'Expected exactly one domain after "thl" (no extra metadata).',
						headerLine,
					);
				}
				const domain = tokens[0];
				if (!(SUPPORTED_DOMAINS as readonly string[]).includes(domain)) {
					fail(
						`Unknown Throughline domain "${domain}". Use ${SUPPORTED_DOMAINS.join(", ")}.`,
						headerLine,
					);
				}
				if (typeof node.value !== "string") {
					fail("Expected a Throughline code block body.", headerLine);
				}
				try {
					// compileAst deliberately bypasses the fenced-source parser;
					// enforce the same input budget before splitting host-owned code.
					checkSourceSize(node.value.length + domain.length + 5);
					compileAst({
						kind: domain,
						lines: node.value.split(/\r\n?|\n/),
						...(headerLine !== undefined ? { source: { line: headerLine } } : {}),
					});
				} catch (error) {
					if (!(error instanceof ProgramError)) throw error;
					const first = error.diagnostics.find(
						(diagnostic) =>
							diagnostic.line !== undefined &&
							Number.isSafeInteger(diagnostic.line) &&
							diagnostic.line > 0,
					);
					// The core uses line 1 when no source location is supplied.
					// Do not pretend that line belongs to an unpositioned document.
					const reason =
						headerLine === undefined
							? error.message.replace(/(^|\n)Line \d+: /g, "$1")
							: error.message;
					fail(reason, first?.line);
				}
			}
			for (const child of node.children ?? []) visit(child);
		};
		visit(tree);
	};
}

export default remarkThroughline;
