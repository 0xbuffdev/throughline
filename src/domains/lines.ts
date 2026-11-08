import type { ThlBlock } from "../dsl.js";
import { checkSourceSize } from "../limits.js";
import { ProgramError } from "../model.js";

export type FenceLine = { text: string; line: number };

export function sourceLine(ast: ThlBlock, index = 0): number {
	return (ast.source?.line ?? 1) + index + 1;
}

/**
 * Non-empty, non-comment fence lines with fence line numbers (header is
 * line 1, first body line is line 2). Blank lines are retained by the parser so diagnostics refer to the
 * original source in every domain.
 */
export function sourceLines(ast: ThlBlock): FenceLine[] {
	if (
		ast.source &&
		(!Number.isSafeInteger(ast.source.line) || ast.source.line < 1)
	)
		throw new ProgramError([
			{ message: "Source line must be a positive safe integer." },
		]);
	checkSourceSize(
		ast.lines.reduce(
			(size, line) => size + line.length + 1,
			ast.kind.length + 4,
		),
	);
	const out: FenceLine[] = [];
	ast.lines.forEach((raw, index) => {
		const text = raw.trim();
		if (!text || text.startsWith("#")) return;
		out.push({ text, line: sourceLine(ast, index) });
	});
	return out;
}
