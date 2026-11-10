import { cn } from "cn";
import type * as React from "react";
import type { Edge, Layout } from "../layout/types.js";
import { projectLayout } from "../layout.js";
import type { Frame, Relation, SceneGroup } from "../model.js";
import { parseTarget } from "../path.js";
import { projectScene } from "../scene.js";
import { NodeCard, truncate } from "./node-card.js";

interface SceneLinkProps {
	relation: Relation;
	edge: Edge;
	frame: Frame;
	transferred: boolean;
}
function SceneLink({
	relation,
	edge,
	frame,
	transferred,
}: SceneLinkProps): React.JSX.Element {
	const label = relation.label;
	return (
		<g className={cn("thl-link", { "thl-transferred": transferred })}>
			<title>{`${relation.from} → ${relation.to}${relation.label ? `: ${relation.label}` : ""}`}</title>
			<path d={edge.d} className="thl-edge" />
			{transferred && (
				<path
					key={frame.index}
					d={edge.d}
					pathLength={1}
					className="thl-flow"
				/>
			)}
			<polygon
				points="0,0 -7,-3.5 -7,3.5"
				transform={`translate(${edge.to[0]},${edge.to[1]}) rotate(${(edge.angle * 180) / Math.PI})`}
			/>
			{label && (
				<text
					x={edge.label[0]}
					y={edge.label[1] - 8}
					textAnchor="middle"
					className="thl-edge-label"
				>
					{truncate(label, 20)}
					<title>{label}</title>
				</text>
			)}
		</g>
	);
}

interface TraceSceneProps {
	frame: Frame;
	previous?: Frame;
	layout: Layout;
	groups?: readonly SceneGroup[];
	selectedId?: string;
	onSelect?: (id: string) => void;
}
export function TraceScene({
	frame,
	previous,
	layout,
	groups,
	selectedId,
	onSelect,
}: TraceSceneProps): React.JSX.Element {
	const scene = projectScene(frame.state, groups, {
		selectedIds: selectedId ? [selectedId] : [],
	});
	const geometry = projectLayout(layout, scene);
	const before = new Map(
		previous?.state.entities.map((entity) => [entity.id, entity.value]),
	);
	const targets = frame.state.active.map(parseTarget);
	const changes = frame.state.changed.map(parseTarget);
	return (
		<>
			{scene.groups.map((group) => {
				const box = geometry.groups.find((candidate) => candidate.name === group.name);
				return box ? (
					<g key={group.id} data-layout={group.layout}>
						<rect
							x={box.x}
							y={box.y}
							width={box.w}
							height={box.h}
							rx={12}
							className="thl-group"
						/>
						<text x={box.x + 12} y={box.y + 20} className="thl-group-label">
							{truncate(group.name, Math.floor((box.w - 24) / 7))}
						</text>
					</g>
				) : null;
			})}
			{scene.edges.map(({ id, relation, transferred }) =>
				geometry.edges[id] ? (
					<SceneLink
						key={id}
						relation={relation}
						edge={geometry.edges[id]}
						frame={frame}
						transferred={transferred}
					/>
				) : null,
			)}
			{scene.nodes.map(({ id, entity }) => geometry.nodes[id] ? (
				<NodeCard
					key={id}
					entity={entity}
					previous={before.get(id)}
					box={geometry.nodes[id]}
					focus={targets.flatMap((target) =>
						target?.id === entity.id ? [target.path] : [],
					)}
					selected={id === selectedId}
					onSelect={() => onSelect?.(id)}
					changed={changes.flatMap((target) =>
						target?.id === entity.id ? [target.path] : [],
					)}
				/>
			) : null)}
			{!scene.nodes.length && (
				<text
					x={layout.width / 2}
					y={50}
					textAnchor="middle"
					className="thl-empty"
				>
					No visible state at this step.
				</text>
			)}
		</>
	);
}
