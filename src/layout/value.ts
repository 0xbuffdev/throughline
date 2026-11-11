import type { Entity, Value } from "../model.js";
import type { Path } from "../path.js";
import { effectiveView, format } from "./measure.js";

export type ValueCell = {
	path: Path;
	text: string;
	label?: string;
	x: number;
	y: number;
	w: number;
	h: number;
};
export type ValueLayout = {
	w: number;
	h: number;
	cells: ValueCell[];
	note?: string;
};

const PAD = 8;
const TOP = 27;
const gap = 4;
const limit = (n: number, min: number, max: number): number =>
	Math.max(min, Math.min(max, n));

/** Keep the focused position in a bounded window without hiding truncation. */
function windowStart(length: number, count: number, focus: number): number {
	return limit(focus - count + 1, 0, Math.max(0, length - count));
}

function focusIndex(key: Path[number] | undefined, fallback = 0): number {
	return typeof key === "number" && Number.isFinite(key) ? key : fallback;
}

function grid(
	items: { text: string; path: Path; label?: string }[],
	columns: number,
	cellW: number,
	note?: string,
): ValueLayout {
	const labeled = items.some((item) => item.label !== undefined);
	const stride = labeled ? 38 : 28;
	return {
		w: columns * (cellW + gap) - gap + PAD * 2,
		h:
			TOP +
			Math.max(1, Math.ceil(items.length / columns)) * stride +
			(note ? 20 : 6),
		note,
		cells: items.map((item, i) => ({
			...item,
			x: PAD + (i % columns) * (cellW + gap),
			y: TOP + Math.floor(i / columns) * stride,
			w: cellW,
			h: 24,
		})),
	};
}

/** Shared by measurement and SVG rendering: the two cannot disagree on clipping. */
export function presentValue(
	entity: Entity,
	maxWidth: number,
	focus: Path[] = [],
): ValueLayout {
	const { value } = entity;
	const view = effectiveView(entity.view, value);
	const width = Math.max(80, maxWidth);
	let result: ValueLayout;
	if (view === "matrix") {
		const rows = value as Value[][];
		const colCount = rows.reduce(
			(maximum, row) => Math.max(maximum, row.length),
			0,
		);
		const cols = Math.max(
			1,
			Math.min(6, colCount, Math.floor((width - 16) / 36)),
		);
		const firstRow = windowStart(rows.length, 6, focusIndex(focus[0]?.[0]));
		const firstCol = windowStart(colCount, cols, focusIndex(focus[0]?.[1]));
		const visibleRows = rows.slice(firstRow, firstRow + 6);
		const items = visibleRows.flatMap((row, r) =>
			Array.from({ length: cols }, (_, c) => ({
				text: row[firstCol + c] === undefined ? "·" : format(row[firstCol + c]),
				path: [firstRow + r, firstCol + c],
			})),
		);
		const note =
			rows.length > 6 || colCount > cols
				? `Rows ${firstRow + 1}–${firstRow + visibleRows.length}/${rows.length} · cols ${firstCol + 1}–${firstCol + cols}/${colCount}`
				: undefined;
		result = grid(
			items,
			cols,
			Math.min(56, (width - PAD * 2 - (cols - 1) * gap) / cols),
			note,
		);
	} else if (view === "array" || view === "stack" || view === "bits") {
		const bits =
			view === "bits"
				? (value as number)
						.toString(2)
						.padStart(
							Math.max(
								8,
								Math.ceil((value as number).toString(2).length / 4) * 4,
							),
							"0",
						)
				: "";
		const items: Value[] = bits ? [...bits] : (value as Value[]);
		const count = view === "stack" ? 6 : view === "bits" ? items.length : 12;
		const focused = focusIndex(
			focus[0]?.[0],
			view === "stack" ? items.length - 1 : 0,
		);
		const start = windowStart(items.length, count, focused);
		const shown = items.slice(start, start + count);
		const cellW =
			view === "bits"
				? 28
				: Math.min(
						86,
						Math.max(
							34,
							...shown.map((item) => format(item).length * 7.5 + 14),
						),
					);
		const cols =
			view === "stack"
				? 1
				: Math.max(
						1,
						Math.min(
							shown.length || 1,
							Math.floor((width - PAD * 2) / (cellW + gap)),
						),
					);
		const note =
			items.length > count
				? `Items ${start + 1}–${start + shown.length} of ${items.length}`
				: undefined;
		result = grid(
			shown.map((item, i) => ({
				text: format(item),
				path: [bits ? bits.length - 1 - i : start + i],
				label: String(bits ? bits.length - 1 - i : start + i),
			})),
			cols,
			Math.min(cellW, width - PAD * 2),
			note,
		);
	} else if (view === "record") {
		const entries = Object.entries(value as Record<string, Value>);
		const focused = entries.findIndex(([key]) => key === focus[0]?.[0]);
		const start = windowStart(entries.length, 6, focused);
		const shown = entries.slice(start, start + 6);
		const note =
			entries.length > 6
				? `Fields ${start + 1}–${start + shown.length} of ${entries.length}`
				: undefined;
		const cellW = Math.min(
			width - PAD * 2,
			Math.max(
				88,
				...shown.map(
					([key, item]) => (key.length + format(item).length + 2) * 7.5 + 16,
				),
			),
		);
		result = grid(
			shown.map(([key, item]) => ({
				text: `${key}: ${format(item)}`,
				path: [key],
			})),
			1,
			cellW,
			note,
		);
	} else {
		const text = format(value);
		result = grid(
			[{ text, path: [] }],
			1,
			Math.min(width - PAD * 2, Math.max(48, text.length * 7.2 + 16)),
		);
	}
	result.w = Math.min(
		width,
		Math.max(result.w, Math.min(220, entity.label.length * 7 + PAD * 2)),
	);
	if (!result.cells.length)
		result.cells.push({
			path: [],
			text: "empty",
			x: PAD,
			y: TOP,
			w: result.w - PAD * 2,
			h: 28,
		});
	return result;
}
