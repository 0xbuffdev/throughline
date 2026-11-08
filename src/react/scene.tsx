import { cn } from "cn";
import type * as React from "react";
import type { Edge, Layout } from "../layout/types.js";
import type { Frame, Relation } from "../model.js";
import { parseTarget } from "../path.js";
import { visibleScene } from "../scene.js";
import { NodeCard, truncate } from "./node-card.js";

interface SceneLinkProps {
	relation: Relation;
	edge: Edge;
	frame: Frame;
}
function SceneLink({
	relation,
	edge,
	frame,
}: SceneLinkProps): React.JSX.Element {
	const transfer = frame.state.transfers.find(
		(item) => item.relation === relation.id,
	);
	const label = relation.label;
	return (
		<g className={cn("thl-link", { "thl-transferred": !!transfer })}>
			<title>{`${relation.from} → ${relation.to}${relation.label ? `: ${relation.label}` : ""}`}</title>
			<path d={edge.d} className="thl-edge" />
			{transfer && (
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
	const scene = visibleScene(frame.state);
	const before = new Map(
		previous?.state.entities.map((entity) => [entity.id, entity.value]),
	);
	const targets = frame.state.active.map(parseTarget);
	const changes = frame.state.changed.map(parseTarget);
	return (
		<>
			{layout.groups
				.filter((group) =>
					scene.entities.some(
						(entity) => (entity.lane ?? "State") === group.name,
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
			{scene.relations.map((relation) => (
				<SceneLink
					key={relation.id}
					relation={relation}
					edge={layout.edges[relation.id]}
					frame={frame}
				/>
			))}
			{scene.entities.map((entity) => (
				<NodeCard
					key={entity.id}
					entity={entity}
					previous={before.get(entity.id)}
					box={layout.nodes[entity.id]}
					focus={targets.flatMap((target) =>
						target?.id === entity.id ? [target.path] : [],
					)}
					changed={changes.flatMap((target) =>
						target?.id === entity.id ? [target.path] : [],
					)}
				/>
			))}
			{!scene.entities.length && (
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
