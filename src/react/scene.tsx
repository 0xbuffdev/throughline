import { cn } from "cn";
import type * as React from "react";
import type { Edge, Layout } from "../layout/types.js";
import { projectLayout } from "../layout.js";
import type { Frame, Relation, SceneGroup } from "../model.js";
import { parseTarget } from "../path.js";
import { projectScene } from "../scene.js";
import { NodeCard, truncate } from "./node-card.js";

interface SceneLinkProps {
	sourceRelationIds: readonly string[];
	aggregated?: boolean;
	relation: Relation;
	edge: Edge;
	frame: Frame;
	transferred: boolean;
}
function SceneLink({
	sourceRelationIds,
	aggregated,
	relation,
	edge,
	frame,
	transferred,
}: SceneLinkProps): React.JSX.Element {
	const label = relation.label;
	return (
		<g className={cn("thl-link", { "thl-transferred": transferred })}>
			<title>{aggregated ? `${sourceRelationIds.length} authored connection(s): ${sourceRelationIds.join(", ")}. Transfer annotations do not write destination state.` : `${relation.from} → ${relation.to}${relation.label ? `: ${relation.label}` : ""}`}</title>
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
	collapsedGroupIds?: readonly string[];
	onExpandGroup?: (id: string) => void;
	onSelect?: (id: string) => void;
}
export function TraceScene({
	frame,
	previous,
	layout,
	groups,
	selectedId,
	collapsedGroupIds,
	onExpandGroup,
	onSelect,
}: TraceSceneProps): React.JSX.Element {
	const scene = projectScene(frame.state, groups, {
		selectedIds: selectedId ? [selectedId] : [],
		collapsedGroupIds,
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
				const box = geometry.groups.find((candidate) => (candidate.id ?? candidate.name) === group.id);
				return box ? (
					<g key={group.id} data-layout={group.layout} data-group={group.id} data-collapsed={group.collapsed || undefined}>
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
			{scene.edges.map(({ id, relation, transferred, aggregated, sourceRelationIds }) =>
				geometry.edges[id] ? (
					<SceneLink
						key={id}
						sourceRelationIds={sourceRelationIds}
						aggregated={aggregated}
						relation={relation}
						edge={geometry.edges[id]}
						frame={frame}
						transferred={transferred}
					/>
				) : null,
			)}
			{scene.nodes.map(({ id, entity, summaryGroupId, sourceEntityIds }) => geometry.nodes[id] ? (
				summaryGroupId ? (
					<g
						key={id}
						data-group-summary={summaryGroupId}
						role="button"
						tabIndex={0}
						aria-label={`Expand group ${entity.label}`}
						aria-expanded="false"
						transform={`translate(${geometry.nodes[id].x},${geometry.nodes[id].y})`}
						onClick={() => onExpandGroup?.(summaryGroupId)}
						onKeyDown={(event) => {
							if (event.key === "Enter" || event.key === " ") {
								event.preventDefault();
								event.stopPropagation();
								onExpandGroup?.(summaryGroupId);
							}
						}}
					>
						<title>{`${entity.label}: ${sourceEntityIds?.length ?? 0} authored-visible entities (collapsed)`}</title>
						<rect width={geometry.nodes[id].w} height={geometry.nodes[id].h} rx={8} className="thl-summary-node" />
						<text x={10} y={24} className="thl-node-label">{truncate(entity.label, Math.floor((geometry.nodes[id].w - 20) / 7))}</text>
						<text x={10} y={44} className="thl-summary-count">{sourceEntityIds?.length ?? 0} visible entities</text>
					</g>
				) :
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
