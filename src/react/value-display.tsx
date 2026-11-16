import type * as React from "react";
import { useMemo, useState } from "react";
import type { Cell, JsonValue, QueryCell } from "../v2/model.js";
import { encodeJson } from "../v2/validator.js";

const PREVIEW = 150;
const EXACT_PART = 1024;

export { summarizeCell } from "../v2/value-summary.js";
import { summarizeValue, summarizeCell } from "../v2/value-summary.js";

export function nodeValueLines(cell: Cell | null): readonly string[] {
 return [summarizeCell(cell)];
}

/**
 * Full validated JSON always stays reachable, but the browser mounts only a
 * single 1,024-code-unit fragment on demand. Avoid splitting a surrogate
 * pair across fragments; an escaped JSON string remains exactly readable.
 */
function jsonFragments(source: string): readonly string[] {
	const parts: string[] = [];
	for (let index = 0; index < source.length;) {
		let end = Math.min(source.length, index + EXACT_PART);
		if (end < source.length && end > index &&
			source.charCodeAt(end - 1) >= 0xd800 &&
			source.charCodeAt(end - 1) <= 0xdbff &&
			source.charCodeAt(end) >= 0xdc00 &&
			source.charCodeAt(end) <= 0xdfff) end++;
		parts.push(source.slice(index, end));
		index = end;
	}
	return parts;
}

/** Exact, inert, chunked canonical JSON for long cells or source payloads. */
export function ExactJson({ value, label, prefix }: {
	value: JsonValue; label: string; prefix: string;
}): React.JSX.Element {
	const json = useMemo(() => encodeJson(value), [value]);
	const [expanded, setExpanded] = useState(false);
	const [part, setPart] = useState(0);
	const fragments = useMemo(() => expanded ? jsonFragments(json) : [], [expanded, json]);
	const current = Math.min(part, Math.max(0, fragments.length - 1));
	const before = fragments.slice(0, current).reduce((n, chunk) => n + chunk.length, 0);
	const active = fragments[current] ?? "";
	return <div className="thl-v2-inspect-value">
		<code>{prefix}{typeof value === "object" && value !== null ? summarizeValue(value) : json.length > PREVIEW
			? json.slice(0, PREVIEW) + "… (truncated preview)" : json}</code>
		{(json.length > PREVIEW || (typeof value === "object" && value !== null)) && <>
			<button type="button" aria-expanded={expanded}
				onClick={() => { setExpanded(open => !open); setPart(0); }}>
				{expanded ? "Hide exact " : "Show exact "}{label} ({json.length} code units)
			</button>
			{expanded && <div className="thl-v2-inspect-exact" role="region"
				aria-label={"Exact " + label}>
				<p>Exact canonical JSON, segment {current + 1} of {fragments.length};
					code units {before + 1}–{before + active.length} of {json.length}.
					Only the visible segment is mounted. Use the next/previous controls
					to inspect the complete value without omission.</p>
				<pre>{active}</pre>
				<div className="thl-v2-inspect-pager" role="group"
					aria-label={"Exact " + label + " segments"}>
					<button type="button" disabled={current === 0}
						onClick={() => setPart(n => Math.max(0, n - 1))}>
						Previous value segment
					</button>
					<button type="button" disabled={current + 1 >= fragments.length}
						onClick={() => setPart(n => Math.min(fragments.length - 1, n + 1))}>
						Next value segment
					</button>
				</div>
			</div>}
		</>}
	</div>;
}

/** Unknown, absent and known null are never interchangeable. */
export function CellValue({ cell, label }: {
	cell: QueryCell; label: string;
}): React.JSX.Element {
	if (cell.status === "absent") return <span>Absent at requested path</span>;
	if (cell.status === "unknown") return <span>
		Unknown{cell.reason ? ": " + cell.reason : ""}
	</span>;
	return <ExactJson value={cell.value} prefix="Known: " label={label}/>;
}

const TREE_PAGE = 8;

/** Mount children on request, in bounded pages; never duplicate a large JSON blob. */
export function ValueTree({ value, name = "Value" }: { value: JsonValue; name?: string }): React.JSX.Element {
 const [open, setOpen] = useState(false);
 const [page, setPage] = useState(0);
 if (value === null || typeof value !== "object")
  return <code className="value-leaf">{summarizeValue(value)}</code>;
 const keys = Object.keys(value);
 const maxPage = Math.max(0, Math.ceil(keys.length / TREE_PAGE) - 1);
 const current = Math.min(page, maxPage);
 const shown = keys.slice(current * TREE_PAGE, (current + 1) * TREE_PAGE);
 return <details className="value-tree" onToggle={event => setOpen(event.currentTarget.open)}>
  <summary><span>{name}</span><code>{summarizeValue(value)}</code></summary>
  {open && <>
   <dl>{shown.map(key => <div key={key}>
    <dt>{Array.isArray(value) ? `[${key}]` : key}</dt>
    <dd><ValueTree value={(value as Record<string, JsonValue>)[key]!} name={key}/></dd>
   </div>)}</dl>
   {keys.length === 0 && <p className="value-empty">Empty {Array.isArray(value) ? "list" : "object"}.</p>}
   {maxPage > 0 && <div className="value-pages" role="group" aria-label={name + " fields"}>
    <button type="button" disabled={current === 0} onClick={() => setPage(n => Math.max(0, n - 1))}>Previous fields</button>
    <span>{current + 1} / {maxPage + 1}</span>
    <button type="button" disabled={current === maxPage} onClick={() => setPage(n => Math.min(maxPage, n + 1))}>Next fields</button>
   </div>}
  </>}
 </details>;
}
