import { cn } from "cn";
import type * as React from "react";
import type { Edge, Layout } from "../layout/types.js";
import { projectLayout } from "../layout.js";
import type { Frame, Relation, SceneGroup } from "../model.js";
import { parseTarget } from "../path.js";
import { projectScene } from "../scene.js";
import type { TraceProgress } from "../scene/progress.js";
import { NodeCard, truncate } from "./node-card.js";

interface SceneLinkProps {
	sourceRelationIds: readonly string[];
	traversedIds: readonly string[];
	revealed: boolean;
	aggregated?: boolean;
	activeSourceRelationIds?: readonly string[];
	relation: Relation;
	edge: Edge;
	frame: Frame;
	transferred: boolean;
}
function SceneLink({
	sourceRelationIds,
	traversedIds,
	revealed,
	aggregated,
	activeSourceRelationIds,
	relation,
	edge,
	frame,
	transferred,
}: SceneLinkProps): React.JSX.Element {
	const label = relation.label;
	return (
		<g className={cn("thl-link", {
			"thl-visited": traversedIds.length > 0,
			"thl-revealed": revealed,
			"thl-transferred": transferred && !aggregated,
			"thl-aggregate-active": aggregated && transferred,
			"thl-aggregate-visited": aggregated && traversedIds.length > 0,
		})}>
			<title>{aggregated
				? `${sourceRelationIds.length} authored connection(s) (${relation.from} → ${relation.to}): ${sourceRelationIds.join(", ")}. Sent in this step: ${activeSourceRelationIds?.join(", ") || "none"}. ${traversedIds.length} of ${sourceRelationIds.length} connections sent so far. A send never implies persisted destination state.`
				: `${relation.from} → ${relation.to}${relation.label ? `: ${relation.label}` : ""}`}</title>
			{(traversedIds.length > 0 || revealed) && (
				<desc>{traversedIds.length > 0
					? "This relation carried an authored send at or before the current step. This does not imply delivery, acknowledgment, or persisted state."
					: "Connection explicitly revealed by an authored structural event; no message transfer implied."}</desc>
			)}
			{/* Animate the actual connector path, never an overlay. Re-key it
			    for consecutive sends so each distinct authored event animates. */}
			<path key={transferred && !aggregated ? `send-${frame.index}` : "steady"}
				d={edge.d} pathLength={1} className="thl-edge" />
			<polygon
				points="0,0 -7,-3.5 -7,3.5"
				transform={`translate(${edge.to[0]},${edge.to[1]}) rotate(${(edge.angle * 180) / Math.PI})`}
			/>
			{label && edge.labelVisible !== false && (
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
	progress: TraceProgress;
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
	progress,
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
				const box = geometry.groups.find((candidate) => candidate.name === group.name);
				return box ? (
					<g key={group.id} data-layout={group.layout} data-group={group.id} data-collapsed={group.collapsed || undefined}>
						<rect
							x={box.x}
							y={box.y}
							width={box.w}
							height={box.h}
							rx={2}
							className="thl-group"
						/>
						<text x={box.x + 8} y={box.y + 17} className="thl-group-label">
							{truncate(group.name, Math.floor((box.w - 16) / 7))}
						</text>
					</g>
				) : null;
			})}
			{scene.edges.map(({ id, relation, transferred, aggregated, sourceRelationIds, activeSourceRelationIds }) =>
				geometry.edges[id] ? (
					<SceneLink
						key={id}
						sourceRelationIds={sourceRelationIds}
						traversedIds={sourceRelationIds.filter((id) => progress.traversedRelations.has(id))}
						revealed={sourceRelationIds.some((id) => progress.revealedRelations.has(id))}
						aggregated={aggregated}
						activeSourceRelationIds={activeSourceRelationIds}
						relation={relation}
						edge={geometry.edges[id]}
						frame={frame}
						transferred={transferred}
					/>
				) : null,
			)}
			{scene.nodes.map(({ id, entity, summaryGroupId, sourceEntityIds, focused, changed }) => geometry.nodes[id] ? (
				summaryGroupId ? (
					<g
						key={id}
						data-group-summary={summaryGroupId}
						role="button"
						tabIndex={0}
						aria-label={`Expand group ${entity.label}${sourceEntityIds?.some((id) => progress.participatingNodes.has(id)) ? ", contains workflow activity" : ""}`}
						aria-describedby={focused || changed ? `thl-summary-state-${summaryGroupId}` : undefined}
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
						<title>{`${entity.label}: ${sourceEntityIds?.length ?? 0} authored-visible entities (collapsed).${changed ? " State changed this step." : ""}${focused ? " Contains authored active focus." : ""}${sourceEntityIds?.some((id) => progress.participatingNodes.has(id)) ? " Contains prior or current workflow activity." : ""}`}</title>
						<rect
							width={geometry.nodes[id].w}
							height={geometry.nodes[id].h}
							rx={2}
							className={cn("thl-summary-node", { "thl-visited": sourceEntityIds?.some((id) => progress.participatingNodes.has(id)), "thl-focused": focused, "thl-changed": changed })}
						/>
						<text x={8} y={17} className="thl-node-label">{truncate(entity.label, Math.floor((geometry.nodes[id].w - 20) / 7))}</text>
						<text x={8} y={34} className="thl-summary-count">{sourceEntityIds?.length ?? 0} visible entities</text>
						{(focused || changed) && (
							<text
								id={`thl-summary-state-${summaryGroupId}`}
								x={8}
								y={56}
								className={cn("thl-summary-state", { "thl-changed": changed })}
							>
								{changed ? "Changed" : "Focused"}{focused && changed ? " · Active" : ""}
							</text>
						)}
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
					visited={progress.participatingNodes.has(entity.id)}
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
