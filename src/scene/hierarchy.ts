import type { SceneGroup } from "../model.js";
import type {
	ProjectedEdge,
	ProjectedGroup,
	ProjectedNode,
	ProjectedScene,
	ProjectionOptions,
} from "../scene.js";

const groupKey = (group: SceneGroup): string => group.id ?? group.name;
const summaryId = (id: string): string => `group:${id}`;

/**
 * Collapse is a read-only projection over authored-visible nodes and links.
 * The synthetic IDs are deliberately outside the authored identifier grammar.
 * Transfer annotations keep their real relation IDs, even when invisible.
 */
export function projectHierarchy(
	base: ProjectedScene,
	groups: readonly SceneGroup[],
	options: ProjectionOptions,
): ProjectedScene {
	if (!groups.length) return base;
	const byName = new Map(groups.map((group) => [group.name, group]));
	const byId = new Map(groups.map((group) => [groupKey(group), group]));
	const collapsed = new Set(options.collapsedGroupIds ?? []);
	const members = new Map<string, string[]>();
	const remapped = new Map<string, string>();
	const summaryMembers = new Map<string, ProjectedNode[]>();
	for (const node of base.nodes) {
		let group = byName.get(node.entity.lane ?? "State");
		const ancestry: SceneGroup[] = [];
		const visited = new Set<string>();
		while (group && !visited.has(groupKey(group))) {
			const id = groupKey(group);
			visited.add(id);
			ancestry.push(group);
			const list = members.get(id) ?? [];
			list.push(node.sourceId);
			members.set(id, list);
			group = group.parentId ? byId.get(group.parentId) : undefined;
		}
		// Select the outermost collapsed ancestor. Ancestor and child collapse
		// choices can coexist without creating nested summary nodes.
		const owner = ancestry.reverse().find((group) => collapsed.has(groupKey(group)));
		if (owner) {
			const id = groupKey(owner);
			remapped.set(node.id, summaryId(id));
			const list = summaryMembers.get(id) ?? [];
			list.push(node);
			summaryMembers.set(id, list);
		}
	}
	const nodes: ProjectedNode[] = base.nodes.filter((node) => !remapped.has(node.id));
	for (const group of groups) {
		const id = groupKey(group);
		const content = summaryMembers.get(id);
		if (!content?.length) continue;
		const sourceEntityIds = Object.freeze(content.map((node) => node.sourceId));
		const virtualId = summaryId(id);
		nodes.push(Object.freeze({
			id: virtualId,
			sourceId: virtualId,
			summaryGroupId: id,
			sourceEntityIds,
			entity: Object.freeze({
				id: virtualId,
				label: group.name,
				lane: group.name,
				value: `${content.length} visible ${content.length === 1 ? "entity" : "entities"}`,
				view: "text" as const,
			}),
			selected: false,
			focused: content.some((node) => node.focused),
			changed: content.some((node) => node.changed),
		}));
	}
	const retained = new Set(nodes.map((node) => node.id));
	const edges: ProjectedEdge[] = [];
	const aggregates = new Map<string, { from: string; to: string; ids: string[]; activeIds: string[]; labels: string[] }>();
	for (const edge of base.edges) {
		const from = remapped.get(edge.relation.from) ?? edge.relation.from;
		const to = remapped.get(edge.relation.to) ?? edge.relation.to;
		if (!retained.has(from) || !retained.has(to)) continue;
		if (from === to && from.startsWith("group:")) continue;
		if (from === edge.relation.from && to === edge.relation.to) {
			edges.push(edge);
			continue;
		}
		const key = JSON.stringify([from, to]);
		let group = aggregates.get(key);
		if (!group) {
			group = { from, to, ids: [], activeIds: [], labels: [] };
			aggregates.set(key, group);
		}
		group.ids.push(...edge.sourceRelationIds);
		if (edge.relation.label) group.labels.push(edge.relation.label);
		if (edge.transferred) group.activeIds.push(...edge.sourceRelationIds);
	}
	for (const [key, aggregate] of aggregates) {
		const id = `aggregate:${key}`;
		edges.push(Object.freeze({
			id,
			aggregated: true,
			sourceRelationIds: Object.freeze([...aggregate.ids]),
			relation: Object.freeze({
				id, from: aggregate.from, to: aggregate.to,
				label: aggregate.ids.length === 1
					? aggregate.labels[0] ?? "1 connection"
					: `${aggregate.ids.length} connections`,
			}),
			transferred: aggregate.activeIds.length > 0,
			activeSourceRelationIds: Object.freeze([...aggregate.activeIds]),
		}));
	}
	const projectedGroups: ProjectedGroup[] = [];
	// Include every visible ancestor, then implicit flat lanes. Collapsed
	// descendants are hidden from the presentation, never from the trace.
	for (const group of groups) {
		const id = groupKey(group);
		const sourceEntityIds = members.get(id);
		if (!sourceEntityIds?.length) continue;
		let ancestor = group.parentId ? byId.get(group.parentId) : undefined;
		const visited = new Set([id]);
		let underCollapsed = false;
		while (ancestor && !visited.has(groupKey(ancestor))) {
			const ancestorId = groupKey(ancestor);
			visited.add(ancestorId);
			if (collapsed.has(ancestorId)) { underCollapsed = true; break; }
			ancestor = ancestor.parentId ? byId.get(ancestor.parentId) : undefined;
		}
		if (underCollapsed) continue;
		projectedGroups.push(Object.freeze({
			id,
			name: group.name,
			layout: group.layout,
			sourceEntityIds: Object.freeze([...sourceEntityIds]),
			...(group.parentId ? { parentId: group.parentId } : {}),
			...(collapsed.has(id) ? { collapsed: true } : {}),
		}));
	}
	for (const group of base.groups) {
		if (!byName.has(group.name)) projectedGroups.push(Object.freeze({ ...group, id: `lane:${group.name}` }));
	}
	// Parent backgrounds must render before their children regardless of
	// source declaration order (forward parent references are permitted).
	const depth = (id: string): number => {
		const seen = new Set<string>();
		let current = byId.get(id);
		let level = 0;
		while (current?.parentId && !seen.has(current.parentId)) {
			seen.add(current.parentId);
			level++;
			current = byId.get(current.parentId);
		}
		return level;
	};
	projectedGroups.sort((left, right) => depth(left.id) - depth(right.id));
	const renderedIds = new Set(edges.flatMap((edge) => edge.sourceRelationIds));
	const transfers = base.transfers.map((transfer) =>
		Object.freeze({
			...transfer,
			visible: transfer.visible && transfer.sourceRelationIds.some((id) => renderedIds.has(id)),
		}),
	);
	return Object.freeze({
		nodes: Object.freeze(nodes),
		edges: Object.freeze(edges),
		groups: Object.freeze(projectedGroups),
		transfers: Object.freeze(transfers),
	});
}
