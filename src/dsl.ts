import { checkSourceSize } from "./limits.js";
import { ProgramError, type SourceLocation } from "./model.js";

/** A single parsed fence. Markdown adapters supply lines directly, without reparsing. */
export type ThlBlock = {
	kind: string;
	lines: string[];
	/** Location of the header, so the first body line is source.line + 1. */
	source?: SourceLocation;
};

/**
 * Parse one thl block, optionally fenced with backticks or tildes. Fence
 * lengths/indentation follow CommonMark; document/container parsing belongs
 * to the host's Markdown parser, not a second parser inside the engine.
 */
export function parseThl(src: string): ThlBlock | null {
	checkSourceSize(src.length);
	const lines = src.replace(/^\uFEFF/, "").split(/\r\n?|\n/);
	const start = lines.findIndex((line) => line.trim() !== "");
	if (start < 0) return null;
	const first = lines[start];
	const fence = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(first);
	const header = (fence ? fence[2] : first).trim().split(/\s+/);
	if (header[0] !== "thl") return null;
	const line = start + 1;
	if (header.length !== 2) {
		throw new ProgramError([
			{
				message: "Expected header: thl <domain>, without extra options.",
				line,
			},
		]);
	}
	let end = lines.length;
	if (fence) {
		const marker = fence[1];
		for (let index = start + 1; index < lines.length; index++) {
			const close = /^ {0,3}(`{3,}|~{3,})[\t ]*$/.exec(lines[index]);
			if (close?.[1][0] === marker[0] && close[1].length >= marker.length) {
				end = index;
				break;
			}
		}
		const trailing = lines.findIndex(
			(text, index) => index > end && text.trim() !== "",
		);
		if (trailing >= 0) {
			throw new ProgramError([
				{
					message:
						"Expected one Throughline block; found content after its closing fence.",
					line: trailing + 1,
				},
			]);
		}
	}
	return {
		kind: header[1],
		lines: lines.slice(start + 1, end),
		source: { line },
	};
}
