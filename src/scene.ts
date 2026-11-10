import type { Entity, GroupLayout, Relation, SceneGroup, Snapshot, Value } from "./model.js";
import { parseTarget } from "./path.js";

/**
 * View-only preferences. Authored focus and presence still belong to the
 * selected compiled snapshot; no projection option writes back to it.
 */
export type ProjectionOptions = {
	selectedIds?: readonly string[];
	focusIds?: readonly string[];
	mode?: "overview" | "focus";
};

export type ProjectedNode = {
	id: string;
	sourceId: string;
	entity: Entity;
	selected: boolean;
	focused: boolean;
	changed: boolean;
};

export type ProjectedEdge = {
	id: string;
	/** Exact authored relation IDs; allows future aggregation without inventing links. */
	sourceRelationIds: string[];
	relation: Relation;
	transferred: boolean;
};

export type ProjectedGroup = {
	id: string;
	name: string;
	layout: GroupLayout;
	sourceEntityIds: string[];
};

export type ProjectedTransfer = {
	/** A transfer is an annotation, never an implicit destination-state write. */
	sourceRelationIds: string[];
	from?: string;
	to?: string;
	value?: Value;
	/** False when authored visibility or presentation filtering conceals its link. */
	visible: boolean;
};

export type ProjectedScene = {
	nodes: ProjectedNode[];
	edges: ProjectedEdge[];
	groups: ProjectedGroup[];
	transfers: ProjectedTransfer[];
};

const laneOf = (entity: Entity): string => entity.lane ?? "State";

/**
 * Deterministically project one compiled snapshot into view descriptors.
 *
 * Hidden authored nodes and links are always suppressed. Overview retains
 * every authored-visible entity; focus mode narrows to selected/active nodes
 * and the endpoints of visible transfers, falling back to overview only when
 * there is no focus target. Filtering never changes the original state.
 */
export function projectScene(
	state: Snapshot,
	groups: readonly SceneGroup[] = [],
	options: ProjectionOptions = {},
): ProjectedScene {
	const selected = new Set(options.selectedIds ?? []);
	const authoredFocus = state.active
		.map(parseTarget)
		.flatMap((target) => (target ? [target.id] : []));
	const focused = new Set([...authoredFocus, ...(options.focusIds ?? [])]);
	const changed = new Set(
		state.changed
			.map(parseTarget)
			.flatMap((target) => (target ? [target.id] : [])),
	);
	const visibleEntities = state.entities.filter((entity) => !entity.hidden);
	const visibleIds = new Set(visibleEntities.map((entity) => entity.id));
	const visibleRelations = state.relations.filter(
		(relation) =>
			!relation.hidden &&
			visibleIds.has(relation.from) &&
			visibleIds.has(relation.to),
	);
	const visibleRelationIds = new Set(visibleRelations.map((relation) => relation.id));
	const activeRelations = new Set(state.transfers.map((transfer) => transfer.relation));

	const retained = new Set([...selected, ...focused]);
	for (const relation of visibleRelations) {
		if (activeRelations.has(relation.id)) {
			retained.add(relation.from);
			retained.add(relation.to);
		}
	}
	const filter = options.mode === "focus" && retained.size > 0;
	const nodes = visibleEntities
		.filter((entity) => !filter || retained.has(entity.id))
		.map((entity) => ({
			id: entity.id,
			sourceId: entity.id,
			entity,
			selected: selected.has(entity.id),
			focused: focused.has(entity.id),
			changed: changed.has(entity.id),
		}));
	const nodeIds = new Set(nodes.map((node) => node.id));
	const edges = visibleRelations
		.filter(
			(relation) => nodeIds.has(relation.from) && nodeIds.has(relation.to),
		)
		.map((relation) => ({
			id: relation.id,
			sourceRelationIds: [relation.id],
			relation,
			transferred: activeRelations.has(relation.id),
		}));
	const edgeIds = new Set(edges.map((edge) => edge.id));
	const lanes = [...new Set(nodes.map((node) => laneOf(node.entity)))];
	const projectedGroups = lanes.map((name) => ({
		id: name,
		name,
		layout: groups.find((group) => group.name === name)?.layout ?? ("row" as const),
		sourceEntityIds: nodes
			.filter((node) => laneOf(node.entity) === name)
			.map((node) => node.sourceId),
	}));
	const relationById = new Map(state.relations.map((relation) => [relation.id, relation]));
	const transfers = state.transfers.map((transfer) => {
		const relation = relationById.get(transfer.relation);
		return {
			sourceRelationIds: [transfer.relation],
			...(relation ? { from: relation.from, to: relation.to } : {}),
			...(transfer.value !== undefined ? { value: transfer.value } : {}),
			visible:
				visibleRelationIds.has(transfer.relation) && edgeIds.has(transfer.relation),
		};
	});
	return { nodes, edges, groups: projectedGroups, transfers };
}

/** Legacy internal visibility view, equivalent to the unfiltered projection. */
export function visibleScene(
	state: Snapshot,
): Pick<Snapshot, "entities" | "relations"> {
	const scene = projectScene(state);
	return {
		entities: scene.nodes.map((node) => node.entity),
		relations: scene.edges.map((edge) => edge.relation),
	};
}
