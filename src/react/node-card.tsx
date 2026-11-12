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
	visited?: boolean;
	/** True only when this frame was reached by one forward step. */
	animate?: boolean;
	/** Used to restart a cell's change flash on consecutive changing steps. */
	frameIndex?: number;
	/** The frame has an authored send, so value flashes wait for it to land. */
	afterSend?: boolean;
	onSelect?: () => void;
}

export function NodeCard({
	entity,
	previous,
	box,
	focus,
	changed,
	selected = false,
	visited = false,
	animate = false,
	frameIndex = 0,
	afterSend = false,
	onSelect,
}: NodeCardProps): React.JSX.Element {
	const value = presentValue(entity, box.w, focus);
	return (
		<g
			transform={`translate(${box.x},${box.y})`}
			data-node={entity.id}
			role="button"
			tabIndex={0}
			aria-label={`Select ${entity.label}${visited ? " (participated in the workflow)" : ""}`}
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
				rx={2}
				className={cn("thl-node", { "thl-visited": visited, "thl-focused": focus.length > 0, "thl-selected": selected })}
			/>
			{/* Drawn after the body, which must stay the first rect. Selection and
			    keyboard focus use this outer ring so neither can be mistaken for
			    authored focus (a filled, heavier outline). */}
			<rect
				x={-4}
				y={-4}
				width={box.w + 8}
				height={box.h + 8}
				rx={4}
				className={cn("thl-ring", { "thl-ring-selected": selected })}
			/>
			<text x={8} y={17} className="thl-node-label">
				{truncate(entity.label, Math.floor((box.w - 16) / 7))}
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
						// A changed cell is re-keyed by frame so its flash restarts when the
						// same cell changes on consecutive steps.
						key={isChanged && animate ? `${JSON.stringify(cell.path)}@${frameIndex}` : JSON.stringify(cell.path)}
						transform={`translate(${cell.x},${cell.y})`}
						className={cn("thl-cell", {
							"thl-changed": isChanged,
							"thl-focused": isFocused,
							"thl-animate": isChanged && animate,
							"thl-after-send": isChanged && animate && afterSend,
						})}
					>
						<title>{cell.text}</title>
						<rect width={cell.w} height={cell.h} rx={2} />
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
				<text x={8} y={box.h - 8} className="thl-window">
					{truncate(value.note, Math.floor((box.w - 16) / 6.2))}
					<title>{value.note}</title>
				</text>
			)}
		</g>
	);
}
