import { cn } from "cn";
import type * as React from "react";
import { effectiveView, format } from "../layout/measure.js";
import type { Box } from "../layout/types.js";
import { presentValue } from "../layout/value.js";
import type { Entity, Value } from "../model.js";
import { getAt, overlaps, type Path } from "../path.js";

export const truncate = (text: string, length: number): string =>
	text.length > length ? `${text.slice(0, Math.max(1, length - 1))}…` : text;

interface NodeCardProps {
	entity: Entity;
	previous?: Value;
	box: Box;
	focus: Path[];
	changed: Path[];
	selected?: boolean;
	onSelect?: () => void;
}

export function NodeCard({
	entity,
	previous,
	box,
	focus,
	changed,
	selected = false,
	onSelect,
}: NodeCardProps): React.JSX.Element {
	const value = presentValue(entity, box.w, focus);
	return (
		<g
			transform={`translate(${box.x},${box.y})`}
			data-node={entity.id}
			role="button"
			tabIndex={0}
			aria-label={`Select ${entity.label}`}
			aria-pressed={selected}
			onClick={onSelect}
			onKeyDown={(event) => {
				if (event.key === "Enter" || event.key === " ") {
					event.preventDefault();
					event.stopPropagation();
					onSelect?.();
				}
			}}
		>
			<title>{`${entity.label}: ${format(entity.value)}${focus.length ? " (focus)" : ""}`}</title>
			<rect
				width={box.w}
				height={box.h}
				rx={8}
				className={cn("thl-node", { "thl-focused": focus.length > 0, "thl-selected": selected })}
			/>
			<text x={10} y={19} className="thl-node-label">
				{truncate(entity.label, Math.floor((box.w - 20) / 7))}
			</text>
			{value.cells.map((cell) => {
				const isChanged =
					changed.some((path) => overlaps(path, cell.path)) &&
					(effectiveView(entity.view, entity.value) === "bits"
						? typeof previous !== "number" ||
							String(Math.floor(previous / 2 ** Number(cell.path[0])) % 2) !==
								cell.text
						: JSON.stringify(getAt(previous, cell.path)) !==
							JSON.stringify(getAt(entity.value, cell.path)));
				const isFocused = focus.some((path) => overlaps(path, cell.path));
				return (
					<g
						key={JSON.stringify(cell.path)}
						transform={`translate(${cell.x},${cell.y})`}
						className={cn("thl-cell", {
							"thl-changed": isChanged,
							"thl-focused": isFocused,
						})}
					>
						<title>{cell.text}</title>
						<rect width={cell.w} height={cell.h} rx={4} />
						<text
							x={cell.w / 2}
							y={cell.h / 2}
							dominantBaseline="central"
							textAnchor="middle"
						>
							{truncate(cell.text, Math.floor((cell.w - 10) / 7.8))}
						</text>
						{cell.label !== undefined && (
							<text
								x={cell.w / 2}
								y={cell.h + 13}
								textAnchor="middle"
								className="thl-index"
							>
								{cell.label}
							</text>
						)}
					</g>
				);
			})}
			{value.note && (
				<text x={10} y={box.h - 10} className="thl-window">
					{truncate(value.note, Math.floor((box.w - 20) / 6.2))}
					<title>{value.note}</title>
				</text>
			)}
		</g>
	);
}
