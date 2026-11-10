import { cn } from "cn";
import type * as React from "react";
import type { Edge, Layout } from "../layout/types.js";
import { projectLayout } from "../layout.js";
import type { Frame, Relation } from "../model.js";
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
}
export function TraceScene({
	frame,
	previous,
	layout,
}: TraceSceneProps): React.JSX.Element {
	const scene = projectScene(frame.state);
	const geometry = projectLayout(layout, scene);
	const before = new Map(
		previous?.state.entities.map((entity) => [entity.id, entity.value]),
	);
	const targets = frame.state.active.map(parseTarget);
	const changes = frame.state.changed.map(parseTarget);
	return (
		<>
			{geometry.groups
				.filter((group) =>
					scene.nodes.some(
						(node) => (node.entity.lane ?? "State") === group.name,
					),
				)
				.map((group) => (
					<g key={group.name}>
						<rect
							x={group.x}
							y={group.y}
							width={group.w}
							height={group.h}
							rx={12}
							className="thl-group"
						/>
						<text x={group.x + 12} y={group.y + 20} className="thl-group-label">
							{truncate(group.name, Math.floor((group.w - 24) / 7))}
						</text>
					</g>
				))}
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
