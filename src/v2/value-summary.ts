import type { ReadonlyCell, ReadonlyJsonValue, QueryCell } from "./model.js";

/** Bounded summaries describe shape, never synthesize domain meaning. */
export function summarizeValue(value: ReadonlyJsonValue): string {
	if (Array.isArray(value)) return value.length + (value.length === 1 ? " item" : " items");
	if (value !== null && typeof value === "object") {
		const count = Object.keys(value).length;
		return count + (count === 1 ? " field" : " fields");
	}
	const bounded = typeof value === "string" && value.length > 46 ? value.slice(0, 45).replace(/[\uD800-\uDBFF]$/, "") + "…" : value;
	const text = JSON.stringify(bounded);
	return text.length > 48 ? text.slice(0, 47) + "…" : text;
}

export function summarizeCell(cell: ReadonlyCell | QueryCell | null): string {
	if (!cell) return "Unavailable";
	if (cell.status === "unknown") return "Unknown";
	if (cell.status === "absent") return "Absent";
	return summarizeValue(cell.value);
}
