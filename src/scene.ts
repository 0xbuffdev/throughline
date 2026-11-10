import { projectHierarchy } from "./scene/hierarchy.js";
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
	/** Reader-only collapsed group identities; never authored state. */
	collapsedGroupIds?: readonly string[];
};

export type ProjectedNode = {
	id: string;
	sourceId: string;
	/** Detached, deeply frozen view of this snapshot entity. */
	entity: Readonly<Entity>;
	selected: boolean;
	focused: boolean;
	changed: boolean;
	/** Set only for synthetic collapsed summaries, never authored entities. */
	summaryGroupId?: string;
	sourceEntityIds?: readonly string[];
};

export type ProjectedEdge = {
	id: string;
	/** Exact authored relation IDs; allows future aggregation without inventing links. */
	sourceRelationIds: readonly string[];
	/** Detached, frozen view of this snapshot relation. */
	relation: Readonly<Relation>;
	transferred: boolean;
	/** True authored relation IDs that transferred in this frame, never a new event. */
	activeSourceRelationIds?: readonly string[];
	/** Visual aggregate; sourceRelationIds remain the only true relation identities. */
	aggregated?: boolean;
};

export type ProjectedGroup = {
	id: string;
	name: string;
	layout: GroupLayout;
	sourceEntityIds: readonly string[];
	parentId?: string;
	collapsed?: boolean;
};

export type ProjectedTransfer = {
	/** A transfer is an annotation, never an implicit destination-state write. */
	sourceRelationIds: readonly string[];
	from?: string;
	to?: string;
	value?: Value;
	/** False when authored visibility or presentation filtering conceals its link. */
	visible: boolean;
};

export type ProjectedScene = {
	readonly nodes: readonly ProjectedNode[];
	readonly edges: readonly ProjectedEdge[];
	readonly groups: readonly ProjectedGroup[];
	readonly transfers: readonly ProjectedTransfer[];
};

/**
 * Copy only displayed JSON values, not a whole trace or snapshot. Compiled
 * values already obey the version-1 depth and work limits; the iterative walk
 * also avoids recursion while freezing detached objects.
 *
 * Source snapshot objects must never be frozen: they may be shared with
 * earlier/later frames. All projection-owned copies are deeply read-only.
 */
function detachedValue(value: Value): Value {
	const copy: Value = structuredClone(value);
	if (copy === null || typeof copy !== "object") return copy;
	const pending: object[] = [copy];
	const seen = new WeakSet<object>();
	while (pending.length) {
		const current = pending.pop()!;
		if (seen.has(current)) continue;
		seen.add(current);
		for (const child of Object.values(current))
			if (child !== null && typeof child === "object") pending.push(child);
		Object.freeze(current);
	}
	return copy;
}

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
	// Invisible/stale targets cannot suppress an otherwise visible overview.
	const filter =
		options.mode === "focus" && [...retained].some((id) => visibleIds.has(id));
	const nodes = Object.freeze(
		visibleEntities
			.filter((entity) => !filter || retained.has(entity.id))
			.map((entity) =>
				Object.freeze({
					id: entity.id,
					sourceId: entity.id,
					entity: Object.freeze({
						...entity,
						value: detachedValue(entity.value),
					}),
					selected: selected.has(entity.id),
					focused: focused.has(entity.id),
					changed: changed.has(entity.id),
				}),
			),
	);
	const nodeIds = new Set(nodes.map((node) => node.id));
	const edges = Object.freeze(
		visibleRelations
			.filter(
				(relation) => nodeIds.has(relation.from) && nodeIds.has(relation.to),
			)
			.map((relation) =>
				Object.freeze({
					id: relation.id,
					sourceRelationIds: Object.freeze([relation.id]),
					relation: Object.freeze({ ...relation }),
					transferred: activeRelations.has(relation.id),
				}),
			),
	);
	const edgeIds = new Set(edges.map((edge) => edge.id));
	const lanes = [...new Set(nodes.map((node) => laneOf(node.entity)))];
	const projectedGroups = Object.freeze(
		lanes.map((name) =>
			Object.freeze({
				id: name,
				name,
				layout: groups.find((group) => group.name === name)?.layout ?? ("row" as const),
				sourceEntityIds: Object.freeze(
					nodes
						.filter((node) => laneOf(node.entity) === name)
						.map((node) => node.sourceId),
				),
			}),
		),
	);
	const relationById = new Map(state.relations.map((relation) => [relation.id, relation]));
	const transfers = Object.freeze(
		state.transfers.map((transfer) => {
			const relation = relationById.get(transfer.relation);
			return Object.freeze({
				sourceRelationIds: Object.freeze([transfer.relation]),
				...(relation ? { from: relation.from, to: relation.to } : {}),
				...(transfer.value !== undefined
					? { value: detachedValue(transfer.value) }
					: {}),
				visible:
					visibleRelationIds.has(transfer.relation) && edgeIds.has(transfer.relation),
			});
		}),
	);
	const base: ProjectedScene = Object.freeze({ nodes, edges, groups: projectedGroups, transfers });
	return groups.some((group) => group.id !== undefined || group.parentId !== undefined) || options.collapsedGroupIds?.length
		? projectHierarchy(base, groups, options)
		: base;
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
