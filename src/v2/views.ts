import { inspectedTrace } from "./inspector.js";
import type {
	Cell, Id, SemanticEvent, SourceIds, TraceInspector, ViewDescriptor,
	ViewItem, ViewKind, ViewRequest, VisualArtifact,
} from "./model.js";
import { TraceQueryError } from "./inspector.js";

/** Pure v2 rendering; these are *presentation* identities, not model IDs. */
const nodeId = (index: number): Id => "node_" + index;
const groupId = (index: number): Id => "group_" + index;
const linkId = (index: number): Id => "link_" + index;
const eventId = (index: number): Id => "event_" + index;
const aggregateId = (from: string, to: string): Id => "aggregate_" + from + "_" + to;

function fail(path: string, reason: string): never {
	throw new TraceQueryError(path, reason);
}
/**
 * One trusted, immutable view-context index per compiled trace inspector.
 * On repeated seeking, never rescan every historical frame to decide the
 * graph fallback, and never repeat O(relations) searches for relation IDs.
 */
type ViewIndex = {
	readonly artifact: VisualArtifact;
	readonly indexByEventId: ReadonlyMap<Id, number>;
	readonly graphPossible: boolean;
	readonly graphLinks: boolean;
	readonly hasMessages: boolean;
};
const viewIndexes = new WeakMap<TraceInspector, ViewIndex>();

function viewIndex(inspector: TraceInspector): ViewIndex {
	const cached = viewIndexes.get(inspector);
	if (cached) return cached;
	const { artifact, frames } = inspectedTrace(inspector);
	const byId = new Map(artifact.relations.map(relation => [relation.id, relation] as const));
	const indexByEventId = new Map<Id, number>();
	let ordinal = 0;
	for (const step of artifact.steps)
		for (const event of step.events) indexByEventId.set(event.id, ordinal++);
	const graphLinks = frames.some(frame => {
		const presentEntities = new Set(frame.snapshot.presentEntityIds);
		return frame.snapshot.presentRelationIds.some(id => {
			const relation = byId.get(id);
			return relation !== undefined && presentEntities.has(relation.from) &&
				presentEntities.has(relation.to);
		});
	});
	const result: ViewIndex = {
		artifact,
		indexByEventId,
		graphPossible: artifact.entities.length > 0 || (artifact.groups?.length ?? 0) > 0,
		graphLinks,
		hasMessages: artifact.steps.some(step => step.events.some(event => event.type === "message")),
	};
	viewIndexes.set(inspector, result);
	return result;
}


function ids(input: unknown, known: ReadonlySet<Id>, field: string): ReadonlySet<Id> {
	if (input === undefined) return new Set();
	if (!Array.isArray(input)) fail("$." + field, "expected an array of declared IDs");
	const out = new Set<Id>();
	for (const [index, id] of input.entries()) {
		if (typeof id !== "string" || !known.has(id))
			fail("$." + field + "[" + index + "]", "undeclared source ID");
		if (out.has(id))
			fail("$." + field + "[" + index + "]", "duplicate source ID");
		out.add(id);
	}
	return out;
}

function freezeIds(ids: readonly Id[]): readonly Id[] {
	return Object.freeze(ids);
}
function source(input: SourceIds): Readonly<SourceIds> {
	return Object.freeze(input);
}
function item(input: ViewItem): ViewItem {
	return Object.freeze(input);
}
function descriptor(kind: ViewKind, frameId: string, summary: string, items: ViewItem[],
	diagnostics: readonly string[] = []): ViewDescriptor {
	return Object.freeze({
		kind, frameId, summary,
		items: Object.freeze(items),
		...(diagnostics.length ? { diagnostics: Object.freeze([...diagnostics]) } : {}),
	});
}

function eventSource(event: SemanticEvent, artifact: VisualArtifact): Readonly<SourceIds> {
	const relationId = event.type === "message"
		? event.relationId
		: event.type === "topology" && event.target === "relation"
			? event.targetId : undefined;
	const relation = relationId
		? artifact.relations.find((candidate) => candidate.id === relationId)
		: undefined;
	const actor = event.type === "write" || event.type === "observation"
		? [event.entityId]
		: event.type === "topology" && event.target === "entity"
			? [event.targetId]
			: relation ? [relation.from, relation.to] : [];
	return source({
		eventIds: freezeIds([event.id]),
		...(actor.length ? { entityIds: freezeIds([...new Set(actor)]) } : {}),
		...(relationId ? { relationIds: freezeIds([relationId]) } : {}),
	});
}

/** Evidence *labels*, not inferred effects or state updates. */
function eventDescription(event: SemanticEvent): string {
	switch (event.type) {
		case "message":
			return "Explicit " + event.phase + " message evidence " + event.id +
				" on relation " + event.relationId +
				". No other message phase or destination persistence is implied.";
		case "observation":
			return "Observed event " + event.id + " on " + event.entityId +
				"; this observation does not mutate modeled state.";
		case "write":
			return "Explicit write " + event.id + " to " + event.entityId +
				"; the atomic step commits this change.";
		case "topology":
			return "Authored presence " + event.id + ": " + event.target +
				" " + event.targetId + (event.present ? " present" : " absent") + ".";
	}
}

function eventItems(events: readonly SemanticEvent[], artifact: VisualArtifact,
	indexByEventId: ReadonlyMap<Id, number>): ViewItem[] {
	return events.map((event) => item({
		id: eventId(indexByEventId.get(event.id)!),
		role: "event",
		label: event.type === "message" ? event.phase + " · " + event.id : event.type + " · " + event.id,
		description: eventDescription(event),
		source: eventSource(event, artifact),
		data: Object.freeze({
			type: event.type,
			...(event.type === "message" ? {
				phase: event.phase, messageId: event.messageId, relationId: event.relationId,
			} : {}),
		}),
	}));
}

function cellDescription(cell: Cell): string {
	return cell.status === "known"
		? "Known modeled value; inspect the complete cell to see its contents."
		: "Unknown modeled value" + (cell.reason ? ": " + cell.reason : "") + ".";
}

/** Fallback never represents unsupported messages as drawn graph sends. */
function stateTable(inspector: TraceInspector, artifact: VisualArtifact,
	request: ViewRequest, diagnostics: readonly string[],
	indexByEventId: ReadonlyMap<Id, number>): ViewDescriptor {
	const frame = inspector.stateAt(request.frameIndex);
	const present = new Set(frame.presentEntityIds);
	const events = request.frameIndex > 0 ? artifact.steps[request.frameIndex - 1].events : [];
	const items: ViewItem[] = artifact.entities.map((entity, index) => {
		const cell = frame.values[entity.id];
		const modeled = present.has(entity.id);
		return item({
			id: nodeId(index),
			role: "value",
			label: entity.label,
			description: entity.label + " is " + (modeled ? "present" : "not present") +
				". " + cellDescription(cell),
			source: source({ entityIds: freezeIds([entity.id]) }),
			data: Object.freeze({ present: modeled, cell }),
		});
	});
	items.push(...eventItems(events, artifact, indexByEventId));
	return descriptor("state-table", request.frameIndex === 0
		? "@initial" : artifact.steps[request.frameIndex - 1].id,
		"State and explicit event evidence at frame " + request.frameIndex +
		". No message delivery or state persistence is inferred.",
		items, diagnostics);
}

/**
 * Project a truthful v2 node-link view; graph items are semantic descriptors
 * without coordinates or React components. Only present modeled actors and
 * present links with present endpoints become visible.
 *
 * Collapse never changes model presence, and collapsed summaries preserve ALL
 * source entity/group/relation/event IDs they represent.
 */
function graph(inspector: TraceInspector, artifact: VisualArtifact, request: ViewRequest,
	selected: ReadonlySet<Id>, collapsed: ReadonlySet<Id>,
	indexByEventId: ReadonlyMap<Id, number>): ViewDescriptor {
	const frame = inspector.stateAt(request.frameIndex);
	const presentEntities = new Set(frame.presentEntityIds);
	const presentRelations = new Set(frame.presentRelationIds);
	const groupIndex = new Map(artifact.groups?.map((group, index) =>
		[group.id, index] as const) ?? []);
	const nodeIndex = new Map(artifact.entities.map((entity, index) =>
		[entity.id, index] as const));
	const groupById = new Map(artifact.groups?.map((group) => [group.id, group] as const) ?? []);
	const relations = artifact.relations.filter((relation) =>
		presentRelations.has(relation.id) &&
		presentEntities.has(relation.from) && presentEntities.has(relation.to));
	const visibleRelationIds = new Set(relations.map(relation => relation.id));
	const relationById = new Map(artifact.relations.map((relation, index) =>
		[relation.id, { relation, index }] as const));
	const events = request.frameIndex > 0 ? artifact.steps[request.frameIndex - 1].events : [];
	const sentInStep = new Map<Id, Id[]>();
	const relationEvents = new Map<Id, Id[]>();
	for (const event of events) {
		if (event.type !== "message") continue;
		if (event.phase === "sent") {
			const list = sentInStep.get(event.relationId) ?? [];
			list.push(event.id);
			sentInStep.set(event.relationId, list);
		}
		const list = relationEvents.get(event.relationId) ?? [];
		list.push(event.id);
		relationEvents.set(event.relationId, list);
	}
	const ancestorIds = (group?: Id): Id[] => {
		const chain: Id[] = [];
		for (let at = group; at !== undefined; at = groupById.get(at)?.parentId)
			chain.unshift(at);
		return chain;
	};
	const ancestors = new Map(artifact.entities.map((entity) =>
		[entity.id, ancestorIds(entity.groupId)] as const));
	const representative = new Map<Id, Id>();
	const visibleGroups = new Set<Id>();
	const collapsedTop = new Set<Id>();
	for (const group of artifact.groups ?? []) {
		const chain = ancestorIds(group.id);
		const hiddenBy = chain.slice(0, -1).find((id) => collapsed.has(id));
		if (hiddenBy !== undefined) continue;
		visibleGroups.add(group.id);
		if (collapsed.has(group.id)) collapsedTop.add(group.id);
	}
	for (const entity of artifact.entities) {
		if (!presentEntities.has(entity.id)) continue;
		const ancestor = ancestors.get(entity.id) ?? [];
		const firstCollapsed = ancestor.find((id) => collapsedTop.has(id));
		representative.set(entity.id, firstCollapsed !== undefined
			? groupId(groupIndex.get(firstCollapsed)!)
			: nodeId(nodeIndex.get(entity.id)!));
	}
	const items: ViewItem[] = [];
	for (const [index, group] of (artifact.groups ?? []).entries()) {
		if (!visibleGroups.has(group.id)) continue;
		const memberIds = artifact.entities.filter((entity) =>
			presentEntities.has(entity.id) &&
			(ancestors.get(entity.id) ?? []).includes(group.id)).map((entity) => entity.id);
		const collapsedHere = collapsedTop.has(group.id);
		const subtree = [group.id, ...(artifact.groups ?? []).filter((candidate) =>
			ancestorIds(candidate.id).slice(0, -1).includes(group.id)).map((g) => g.id)];
		const interior = collapsedHere ? relations.filter((rel) =>
			representative.get(rel.from) === groupId(index) &&
			representative.get(rel.to) === groupId(index)) : [];
		const interiorIds = interior.map((r) => r.id);
		const interiorEventIds = interior.flatMap((r) => relationEvents.get(r.id) ?? []);
		const activeMemberEvents = collapsedHere ? events.filter((e) =>
			(e.type === "write" || e.type === "observation" ||
				(e.type === "topology" && e.target === "entity")) &&
			"entityId" in e && memberIds.includes(e.entityId)).map(e => e.id) : [];
		items.push(item({
			id: groupId(index),
			role: "group",
			label: group.label,
			description: group.label + (collapsedHere ? " collapsed group with " : " expanded group with ") +
				memberIds.length + " present modeled entities. " +
				(interiorIds.length ? interiorIds.length +
					" internal declared relations retain source identity; " : "") +
				"Collapsing is presentation only.",
			source: source({
				groupIds: freezeIds(subtree),
				...(memberIds.length ? { entityIds: freezeIds(memberIds) } : {}),
				...(interiorIds.length ? { relationIds: freezeIds(interiorIds) } : {}),
				...(interiorEventIds.length || activeMemberEvents.length ? {
					eventIds: freezeIds([...new Set([...interiorEventIds, ...activeMemberEvents])]),
				} : {}),
			}),
			data: Object.freeze({ collapsed: collapsedHere, count: memberIds.length,
				selected: memberIds.some(id => selected.has(id)) }),
		}));
	}
	const focus = new Set(request.frameIndex > 0
		? artifact.steps[request.frameIndex - 1].focusEntityIds ?? [] : []);
	const changedIds = new Set(events.filter((event) =>
		event.type === "write").map((event) => (event as Extract<SemanticEvent, {type:"write"}>).entityId));
	for (const [index, entity] of artifact.entities.entries()) {
		if (!presentEntities.has(entity.id)) continue;
		if (representative.get(entity.id) !== nodeId(index)) continue;
		const cell = frame.values[entity.id];
		const authoredWrites = events.filter((event) => event.type === "write" &&
			event.entityId === entity.id).map((event) => event.id);
		items.push(item({
			id: nodeId(index),
			role: "entity",
			label: entity.label,
			description: entity.label + ". " + cellDescription(cell) +
				(changedIds.has(entity.id) ? " Explicit write in this step." : "") +
				(focus.has(entity.id) ? " Authored focus." : ""),
			source: source({
				entityIds: freezeIds([entity.id]),
				...(authoredWrites.length ? { eventIds: freezeIds(authoredWrites) } : {}),
			}),
			data: Object.freeze({
				cell,
				selected: selected.has(entity.id),
				focused: focus.has(entity.id),
				changed: changedIds.has(entity.id),
			}),
		}));
	}
	type EdgeAccum = { from: Id; to: Id; relations: Id[]; allEvents: Id[]; sent: Id[] };
	const mapped = new Map<string, EdgeAccum>();
	for (const [index, relation] of artifact.relations.entries()) {
		if (!visibleRelationIds.has(relation.id)) continue;
		const from = representative.get(relation.from)!;
		const to = representative.get(relation.to)!;
		if (from === to && from.startsWith("group_")) continue; // internal collapsed relations are in group provenance
		const aggregated = from.startsWith("group_") || to.startsWith("group_");
		const key = aggregated ? from + ">" + to : "source:" + index;
		let edge = mapped.get(key);
		if (!edge) {
			edge = { from, to, relations: [], allEvents: [], sent: [] };
			mapped.set(key, edge);
		}
		edge.relations.push(relation.id);
		edge.allEvents.push(...(relationEvents.get(relation.id) ?? []));
		edge.sent.push(...(sentInStep.get(relation.id) ?? []));
	}
	for (const edge of mapped.values()) {
		const only = edge.relations.length === 1
			? relationById.get(edge.relations[0]) : undefined;
		const id = edge.relations.length === 1 && edge.from.startsWith("node_") &&
			edge.to.startsWith("node_")
			? linkId(only!.index)
			: aggregateId(edge.from, edge.to);
		items.push(item({
			id,
			role: "relation",
			label: only?.relation.label ?? (edge.relations.length === 1
				? edge.relations[0] : edge.relations.length + " connections"),
			description: edge.relations.length + " declared modeled connection(s), " +
				edge.sent.length + " explicit sent event(s) at this frame. " +
				"Other phases do not imply sending, delivery or persistence.",
			source: source({
				relationIds: freezeIds(edge.relations),
				...(edge.allEvents.length ? { eventIds: freezeIds(edge.allEvents) } : {}),
			}),
			fromItemId: edge.from, toItemId: edge.to,
			data: Object.freeze({
				sentCurrent: edge.sent.length,
				observedCurrent: edge.allEvents.length - edge.sent.length,
				aggregated: edge.relations.length > 1 ||
					edge.from.startsWith("group_") || edge.to.startsWith("group_"),
			}),
		}));
	}
	items.push(...eventItems(events, artifact, indexByEventId));
	return descriptor("graph", request.frameIndex === 0
		? "@initial" : artifact.steps[request.frameIndex - 1].id,
		"Graph at frame " + request.frameIndex + ": " + representative.size +
		" present modeled entities, " + relations.length +
		" present declared relations, " + (sentInStep.size ? [...sentInStep.values()].flat().length : 0) +
		" explicit sent events. Message receipt, processing and persisted state are never inferred.",
		items);
}

/**
 * Pure projection entrypoint. Sequence is deliberately deferred to TL-U06;
 * its requested/auto-selected absence gives a truthful state/event table plus
 * an explicit diagnostic, never a fabricated graph.
 */
export function projectView(inspector: TraceInspector, request: ViewRequest): ViewDescriptor {
	const indexed = viewIndex(inspector);
	const { artifact, indexByEventId, graphPossible, graphLinks, hasMessages } = indexed;
	if (!request || typeof request !== "object" || Array.isArray(request))
		fail("$.request", "expected a view request");
	// The inspector owns frozen compiled semantics. Querying this frame first
	// gives the canonical typed frame-index failure behavior.
	inspector.stateAt(request.frameIndex);
	const entityIds = new Set(artifact.entities.map(e => e.id));
	const groupIds = new Set(artifact.groups?.map(g => g.id) ?? []);
	const selected = ids(request.selectedEntityIds, entityIds, "selectedEntityIds");
	const collapsed = ids(request.collapsedGroupIds, groupIds, "collapsedGroupIds");
	if (request.kind !== undefined &&
		!["graph", "sequence", "state-table"].includes(request.kind))
		fail("$.kind", "unknown view kind");

	let preferred: ViewKind | undefined = request.kind;
	if (!preferred) {
		const supported = (artifact.views ?? [])
			.filter(hint => hint.kind === "graph" || hint.kind === "state-table")
			.slice().sort((a, b) => a.priority - b.priority ||
				(a.kind === "graph" ? -1 : 1));
		preferred = supported.find(hint => hint.kind === "state-table" || graphPossible)?.kind;
		if (!preferred) preferred = hasMessages ? "sequence" : graphLinks ? "graph" : "state-table";
	}
	if (preferred === "graph" && graphPossible)
		return graph(inspector, artifact, request, selected, collapsed, indexByEventId);
	const diagnostic = preferred === "sequence"
		? "The sequence view is not available until TL-U06; showing explicit state/event evidence, without inventing message sends."
		: preferred === "graph"
			? "Graph view requires at least one declared entity or group; showing the state/event table."
			: "";
	return stateTable(inspector, artifact, request, diagnostic ? [diagnostic] : [], indexByEventId);
}
