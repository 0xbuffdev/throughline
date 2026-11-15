import { inspectedTrace } from "./inspector.js";
import type {
	Cell, Id, Origin, Relation, SemanticEvent, SourceIds, TraceInspector, ViewDescriptor,
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
type TimelineEvent = {
	readonly frameIndex: number;
	readonly frameId: Id;
	readonly stepLabel: string;
	readonly event: SemanticEvent;
};

type ViewIndex = {
	readonly artifact: VisualArtifact;
	readonly indexByEventId: ReadonlyMap<Id, number>;
	readonly timeline: readonly TimelineEvent[];
	readonly relationsById: ReadonlyMap<Id, Relation>;
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
	const timeline: TimelineEvent[] = [];
	let ordinal = 0;
	for (const [index, step] of artifact.steps.entries())
		for (const event of step.events) {
			indexByEventId.set(event.id, ordinal++);
			timeline.push(Object.freeze({
				event, frameIndex: index + 1, frameId: step.id, stepLabel: step.label,
			}));
		}
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
		timeline: Object.freeze(timeline),
		relationsById: byId,
		graphPossible: artifact.entities.length > 0 || (artifact.groups?.length ?? 0) > 0,
		graphLinks,
		hasMessages: timeline.some(entry => entry.event.type === "message"),
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

/** Event type is modeled semantics; origin kind is distinct provenance. */
function eventDescription(event: SemanticEvent, origin: Origin): string {
	let meaning: string;
	switch (event.type) {
		case "message":
			meaning = "Explicit " + event.phase + " message evidence " + event.id +
				" on relation " + event.relationId +
				". No other message phase or destination persistence is implied.";
			break;
		case "observation":
			meaning = "Observation-family event " + event.id + " on " + event.entityId +
				"; this event does not mutate modeled state.";
			break;
		case "write":
			meaning = "Explicit modeled write " + event.id + " to " + event.entityId +
				"; the atomic step commits this change.";
			break;
		case "topology":
			meaning = "Modeled presence change " + event.id + ": " + event.target +
				" " + event.targetId + (event.present ? " present" : " absent") + ".";
			break;
	}
	// The origin is author-declared metadata, even when its kind is
	// "observed". Do not upgrade a simulated or AI-proposed fact into a
	// verified observation or relabel it "authored" because of its type.
	return meaning + " Declared origin " + origin.id + " (" + origin.kind +
		"); provenance is not independent verification.";
}

function eventItems(events: readonly SemanticEvent[], artifact: VisualArtifact,
	indexByEventId: ReadonlyMap<Id, number>): ViewItem[] {
	const origins = new Map(artifact.origins.map(origin => [origin.id, origin] as const));
	return events.map((event) => {
		// A validated artifact requires every event's origin to exist.
		const origin = origins.get(event.originId)!;
		return item({
			id: eventId(indexByEventId.get(event.id)!),
			role: "event",
			label: event.type === "message" ? event.phase + " · " + event.id : event.type + " · " + event.id,
			description: eventDescription(event, origin),
			source: eventSource(event, artifact),
			data: Object.freeze({
				type: event.type,
				originId: origin.id,
				originKind: origin.kind,
				...(event.type === "message" ? {
					phase: event.phase, messageId: event.messageId, relationId: event.relationId,
				} : {}),
			}),
		});
	});
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

const MESSAGE_PHASES = ["sent", "received", "acknowledged", "processed"] as const;
type MessagePhase = typeof MESSAGE_PHASES[number];
type Correlation = {
	readonly messageId: Id;
	readonly relation: Relation;
	readonly eventIds: Id[];
	readonly phases: Record<MessagePhase, number>;
	readonly firstEventId: Id;
};

/**
 * Cumulative authored-order evidence, NOT reconstructed wire chronology.
 *
 * The validated model has four message phases. A retry is another explicit
 * event (and potentially another message ID). Missing phases are omissions
 * in authored evidence, not proof of failure, loss, delivery or persistence.
 * Timeout evidence remains an observation/write, never a fifth phase.
 */
function sequence(inspector: TraceInspector, request: ViewRequest, selected: ReadonlySet<Id>,
	index: ViewIndex): ViewDescriptor {
	const { artifact, relationsById, indexByEventId, timeline } = index;
	const frame = inspector.stateAt(request.frameIndex);
	const currentPresence = new Set(frame.presentEntityIds);
	const entityIndex = new Map(artifact.entities.map((entity, ordinal) =>
		[entity.id, ordinal] as const));
	const visibleTimeline: TimelineEvent[] = [];
	for (const entry of timeline) {
		if (entry.frameIndex > request.frameIndex) break;
		visibleTimeline.push(entry);
	}
	// Both modeled message facts and non-message state/observation evidence
	// remain in exact event order. Correlate by message ID only; the validator
	// enforces that a message ID cannot be used on unrelated relations.
	const groups = new Map<Id, Correlation>();
	const participants = new Set<Id>();
	const observedSent = new Set<Id>();
	const missingSentBeforeEvent = new Set<Id>();
	for (const entry of visibleTimeline) {
		const event = entry.event;
		if (event.type !== "message") continue;
		const relation = relationsById.get(event.relationId)!;
		participants.add(relation.from);
		participants.add(relation.to);
		if (event.phase !== "sent" && !observedSent.has(event.messageId))
			missingSentBeforeEvent.add(event.id);
		if (event.phase === "sent") observedSent.add(event.messageId);
		let group = groups.get(event.messageId);
		if (!group) {
			group = {
				messageId: event.messageId, relation, firstEventId: event.id,
				eventIds: [], phases: { sent: 0, received: 0, acknowledged: 0, processed: 0 },
			};
			groups.set(event.messageId, group);
		}
		group.eventIds.push(event.id);
		group.phases[event.phase]++;
	}
	const items: ViewItem[] = [];
	for (const [ordinal, entity] of artifact.entities.entries()) {
		if (!participants.has(entity.id)) continue;
		const present = currentPresence.has(entity.id);
		items.push(item({
			id: nodeId(ordinal),
			role: "entity",
			label: entity.label,
			description: entity.label + " is an endpoint of an explicitly modeled message. " +
				(present ? "Present" : "Not present") + " in the selected frame. " +
				"This does not establish presence at any other event time.",
			source: source({ entityIds: freezeIds([entity.id]) }),
			data: Object.freeze({ present, selected: selected.has(entity.id) }),
		}));
	}
	for (const group of groups.values()) {
		const { relation, messageId, phases, eventIds } = group;
		const reported = MESSAGE_PHASES.filter(phase => phases[phase] > 0);
		const omitted = MESSAGE_PHASES.filter(phase => phases[phase] === 0);
		const description = "Message ID " + messageId + " on declared relation " + relation.id +
			" (" + relation.from + " to " + relation.to + "). " +
			"Modeled phase counts: " + MESSAGE_PHASES.map(phase =>
				phase + " " + phases[phase]).join(", ") + ". " +
			(omitted.length ? "Not modeled by this frame: " + omitted.join(", ") + ". " : "") +
			"Absence of a phase is not proof of loss, receipt, delivery, " +
			"acknowledgement or state persistence; repeated phases remain distinct evidence.";
		// Keep validated JsonValue-compatible array types at the type boundary;
		// freeze the nested values in-place before publishing the descriptor.
		const correlationData = {
			type: "message-correlation", messageId, relationId: relation.id,
			phases: { ...phases },
			reportedPhases: reported,
			unmodeledPhases: omitted,
		};
		Object.freeze(correlationData.phases);
		Object.freeze(correlationData.reportedPhases);
		Object.freeze(correlationData.unmodeledPhases);
		items.push(item({
			id: "message_" + indexByEventId.get(group.firstEventId)!,
			role: "value",
			label: "Message " + messageId,
			description,
			source: source({
				entityIds: freezeIds(relation.from === relation.to
					? [relation.from] : [relation.from, relation.to]),
				relationIds: freezeIds([relation.id]),
				eventIds: freezeIds(eventIds),
			}),
			fromItemId: nodeId(entityIndex.get(relation.from)!),
			toItemId: nodeId(entityIndex.get(relation.to)!),
			data: Object.freeze(correlationData),
		}));
	}
	const normalized = eventItems(visibleTimeline.map(entry => entry.event),
		artifact, indexByEventId);
	for (const [ordinal, entry] of visibleTimeline.entries()) {
		const event = entry.event;
		const base = normalized[ordinal];
		const relation = event.type === "message"
			? relationsById.get(event.relationId)! : undefined;
		const isCurrent = entry.frameIndex === request.frameIndex;
		const missingSent = missingSentBeforeEvent.has(event.id);
		items.push(item({
			...base,
			description: base.description +
				" Modeled step " + entry.frameId + " (frame " + entry.frameIndex + ")." +
				(missingSent ? " No matching sent event was modeled before this event; " +
					"that is an evidence gap, not proof no send occurred." : "") +
				(event.type === "message" ? " Correlated only by declared message ID " +
					event.messageId + "; no phase or causal link is inferred." :
					" This non-message evidence is not a message phase."),
			...(relation ? {
				fromItemId: nodeId(entityIndex.get(relation.from)!),
				toItemId: nodeId(entityIndex.get(relation.to)!),
			} : {}),
			data: Object.freeze({
				...base.data as Record<string, string | number | boolean>,
				frameIndex: entry.frameIndex,
				frameId: entry.frameId,
				stepLabel: entry.stepLabel,
				current: isCurrent,
				...(relation ? {
					fromEntityId: relation.from, toEntityId: relation.to,
					missingPriorSent: missingSent,
				} : {}),
			}),
		}));
	}
	const frameId = request.frameIndex === 0
		? "@initial" : artifact.steps[request.frameIndex - 1].id;
	const totalMessages = visibleTimeline.filter(entry =>
		entry.event.type === "message").length;
	return descriptor("sequence", frameId,
		"Sequence evidence at frame " + request.frameIndex + ": " +
		totalMessages + " explicit message phase event(s), " + groups.size +
		" correlated message ID(s) and " +
		(visibleTimeline.length - totalMessages) +
		" other modeled event(s). Ordered by authored steps/events, not " +
		"verified physical time. Missing acknowledgements, deliveries, " +
		"responses and persistence remain unmodeled, not assumed lost or successful.",
		items);
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
	const messageEvents = new Map<Id, Id[]>();
	const relationSourceEvents = new Map<Id, Id[]>();
	for (const event of events) {
		const relationId = event.type === "message" ? event.relationId
			: event.type === "topology" && event.target === "relation"
				? event.targetId : undefined;
		if (!relationId) continue;
		// A relation-topology operation is source evidence on its link, but
		// it is never a message phase and must not count as a send/receipt.
		const sources = relationSourceEvents.get(relationId) ?? [];
		sources.push(event.id);
		relationSourceEvents.set(relationId, sources);
		if (event.type !== "message") continue;
		if (event.phase === "sent") {
			const list = sentInStep.get(relationId) ?? [];
			list.push(event.id);
			sentInStep.set(relationId, list);
		}
		const messages = messageEvents.get(relationId) ?? [];
		messages.push(event.id);
		messageEvents.set(relationId, messages);
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
		const declaredMembers = artifact.entities.filter(entity =>
			(ancestors.get(entity.id) ?? []).includes(group.id)).map(entity => entity.id);
		const declaredSet = new Set(declaredMembers);
		const memberIds = declaredMembers.filter(id => presentEntities.has(id));
		const collapsedHere = collapsedTop.has(group.id);
		const subtree = [group.id, ...(artifact.groups ?? []).filter((candidate) =>
			ancestorIds(candidate.id).slice(0, -1).includes(group.id)).map((g) => g.id)];
		const interior = collapsedHere ? relations.filter(rel =>
			representative.get(rel.from) === groupId(index) &&
			representative.get(rel.to) === groupId(index)) : [];
		const presentInteriorIds = new Set(interior.map(rel => rel.id));

		// Model presence controls *what is drawn*, not the source identities
		// of explicitly removed members. Preserve identities referenced by
		// this step's events against DECLARED subtree membership, even when
		// those constituents have disappeared from the committed snapshot.
		const affectedMembers = new Set<Id>();
		if (collapsedHere) for (const event of events) {
			const target = event.type === "write" || event.type === "observation"
				? event.entityId : event.type === "topology" && event.target === "entity"
					? event.targetId : undefined;
			if (target !== undefined && declaredSet.has(target))
				affectedMembers.add(target);
		}
		const sourceMemberIds = collapsedHere
			? declaredMembers.filter(id => presentEntities.has(id) || affectedMembers.has(id))
			: memberIds;
		const interiorIds = collapsedHere ? artifact.relations.filter(rel =>
			declaredSet.has(rel.from) && declaredSet.has(rel.to) &&
			(presentInteriorIds.has(rel.id) || relationSourceEvents.has(rel.id))
		).map(rel => rel.id) : [];
		const interiorEventIds = interiorIds.flatMap(id => relationSourceEvents.get(id) ?? []);
		const memberEventIds = collapsedHere ? events.filter(event => {
			const target = event.type === "write" || event.type === "observation"
				? event.entityId : event.type === "topology" && event.target === "entity"
					? event.targetId : undefined;
			return target !== undefined && declaredSet.has(target);
		}).map(event => event.id) : [];
		const sourcedEvents = new Set([...interiorEventIds, ...memberEventIds]);
		const sourceEventIds = events.filter(event => sourcedEvents.has(event.id))
			.map(event => event.id);
		items.push(item({
			id: groupId(index),
			role: "group",
			label: group.label,
			description: group.label + (collapsedHere ? " collapsed group with " : " expanded group with ") +
				memberIds.length + " present modeled entities. " +
				(interiorIds.length ? interiorIds.length +
					" internal declared relation source(s) retain their IDs; " : "") +
				(sourceMemberIds.length > memberIds.length ||
					interiorIds.length > interior.length
					? "Source evidence includes constituents removed or absent at this frame. "
					: "") +
				"Collapsing is presentation only.",
			source: source({
				groupIds: freezeIds(subtree),
				...(sourceMemberIds.length ? { entityIds: freezeIds(sourceMemberIds) } : {}),
				...(interiorIds.length ? { relationIds: freezeIds(interiorIds) } : {}),
				...(sourceEventIds.length ? { eventIds: freezeIds(sourceEventIds) } : {}),
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
	type EdgeAccum = { from: Id; to: Id; relations: Id[]; allEvents: Id[]; nonSentMessages: number; sent: Id[] };
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
			edge = { from, to, relations: [], allEvents: [], nonSentMessages: 0, sent: [] };
			mapped.set(key, edge);
		}
		edge.relations.push(relation.id);
		edge.allEvents.push(...(relationSourceEvents.get(relation.id) ?? []));
		edge.sent.push(...(sentInStep.get(relation.id) ?? []));
		edge.nonSentMessages += (messageEvents.get(relation.id)?.length ?? 0) -
			(sentInStep.get(relation.id)?.length ?? 0);
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
				observedCurrent: edge.nonSentMessages,
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
 * Pure source-linked projection entrypoint. All three built-in view kinds are
 * implemented; incompatible requests fall back to explicit state/evidence.
 * Auto-selection is stable across the whole artifact, never frame-dependent.
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
		const rank: Record<ViewKind, number> = { sequence: 0, graph: 1, "state-table": 2 };
		const supported = (artifact.views ?? []).slice().sort((a, b) =>
			a.priority - b.priority || rank[a.kind] - rank[b.kind]);
		preferred = supported.find(hint =>
			hint.kind === "state-table" ||
			hint.kind === "sequence" && hasMessages ||
			hint.kind === "graph" && graphPossible)?.kind;
		if (!preferred) preferred = hasMessages ? "sequence" : graphLinks ? "graph" : "state-table";
	}
	if (preferred === "sequence" && hasMessages)
		return sequence(inspector, request, selected, indexed);
	if (preferred === "graph" && graphPossible)
		return graph(inspector, artifact, request, selected, collapsed, indexByEventId);
	const diagnostic = preferred === "sequence"
		? "Sequence view requires an explicit message event in the validated artifact; showing state and other event evidence, not invented phases."
		: preferred === "graph"
			? "Graph view requires at least one declared entity or group; showing the state/event table."
			: "";
	return stateTable(inspector, artifact, request, diagnostic ? [diagnostic] : [], indexByEventId);
}
