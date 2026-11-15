/**
 * Offline, non-evaluating Markdown/MDX fenced-code discovery for the CLI.
 * No MDX execution, React, Remark plugins, HTML rendering or AI providers.
 * Supports CommonMark fences in plain, quoted and list code blocks.
 * Production Remark integration continues to consume real mdast nodes.
 */
import { normalizeThlBody, ThroughlineAuthoringError } from "../v2/authoring.js";

export type MarkdownFence = Readonly<{
	lang: string | null;
	meta: string | null;
	body: string;
	line: number;
	column: number;
	ordinal: number | null;
}>;

const MAX_MARKDOWN_BYTES = 4 * 1024 * 1024;
const MAX_NODES = 10_000;
const fail = (message: string): never => {
	throw new ThroughlineAuthoringError("THL_SYNTAX", message);
};
type Prefix = { quotes: number; listIndent: number; leading: number; remaining: string };

function stripQuotes(value: string, depth: number): string | null {
	let at = 0;
	for (let index = 0; index < depth; index++) {
		const match = /^ {0,3}> ?/.exec(value.slice(at));
		if (!match) return null;
		at += match[0].length;
	}
	return value.slice(at);
}
function openerPrefix(line: string): Prefix {
	let remaining = line;
	let quotes = 0;
	while (quotes < 32) {
		const match = /^ {0,3}> ?/.exec(remaining);
		if (!match) break;
		quotes++;
		remaining = remaining.slice(match[0].length);
	}
	let listIndent = 0;
	const list = /^ {0,3}(?:[-+*]|\d{1,9}[.)])([ \t]+)/.exec(remaining);
	if (list) {
		listIndent = list[0].length;
		remaining = remaining.slice(listIndent);
	}
	const leading = /^ */.exec(remaining)?.[0].length ?? 0;
	return { quotes, listIndent, leading, remaining };
}
function contentLine(line: string, prefix: Prefix): string | null {
	let rest = stripQuotes(line, prefix.quotes);
	if (rest === null) {
		if (line.trim() === "") return "";
		return null;
	}
	if (prefix.listIndent) {
		if (rest.trim() === "") return "";
		const spaces = /^ */.exec(rest)?.[0].length ?? 0;
		if (spaces < prefix.listIndent) return null;
		rest = rest.slice(prefix.listIndent);
	}
	const indent = /^ */.exec(rest)?.[0].length ?? 0;
	return rest.slice(Math.min(prefix.leading, indent));
}
function closingFence(line: string, symbol: string, minimum: number): boolean {
	const match = /^ {0,3}(\x60+|~+)[ \t]*$/.exec(line);
	return !!match && match[1][0] === symbol && match[1].length >= minimum;
}

/**
 * Extract fenced code nodes in lexical/depth-first order. The info string
 * cannot contain a backtick for that fence style. Unclosed fences are
 * CommonMark-valid and consume the rest of their container.
 * The body excludes delimiters and a synthetic final newline.
 */
export function scanMarkdownFences(source: string): readonly MarkdownFence[] {
	if (typeof source !== "string" || Buffer.byteLength(source, "utf8") > MAX_MARKDOWN_BYTES)
		fail("Markdown document is not a bounded UTF-8 string");
	const normalized = normalizeThlBody(source).replace(/^\uFEFF/, "");
	const lines = normalized.split("\n");
	const results: MarkdownFence[] = [];
	let ordinal = 0;
	for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
		const current = lines[lineIndex];
		const prefix = openerPrefix(current);
		if (prefix.leading > 3) continue;
		const raw = prefix.remaining.slice(prefix.leading);
		const opening = /^(\x60{3,}|~{3,})([^\r\n]*)$/.exec(raw);
		if (!opening) continue;
		const symbol = opening[1][0];
		const info = opening[2].trim();
		if (symbol === "\x60" && info.includes("\x60")) continue;
		// First info word is language, rest metadata. Domain tags are invalid.
		const tokens = /^(\S+)(?:\s+([\s\S]+))?$/.exec(info);
		const lang = tokens?.[1] ?? null;
		const meta = tokens?.[2] ?? null;
		const bodyLines: string[] = [];
		let end = lineIndex;
		for (let next = lineIndex + 1; next < lines.length; next++) {
			const parsed = contentLine(lines[next], prefix);
			if (parsed === null) break;
			if (closingFence(parsed, symbol, opening[1].length)) {
				end = next;
				break;
			}
			if (next === lines.length - 1 && lines[next] === "" && normalized.endsWith("\n")) {
				end = next;
				break;
			}
			bodyLines.push(parsed);
			end = next;
		}
		if (results.length >= MAX_NODES) fail("too many fenced code nodes");
		const isThl = lang === "thl";
		results.push(Object.freeze({
			lang, meta, body: bodyLines.join("\n"), line: lineIndex + 1,
			column: current.length - raw.length + 1,
			ordinal: isThl ? ordinal++ : null,
		}));
		lineIndex = end;
	}
	return Object.freeze(results);
}
