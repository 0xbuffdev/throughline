import { inspectedTrace, TraceQueryError } from "./inspector.js";
import type {
	Cell, Claim, HistoryEntry, Id, Origin, Path, QueryCell, Relation,
	SemanticEvent, SourceIds, StateChange, TraceInspector,
} from "./model.js";

/** An authored frame is not necessarily measured physical time. */
export type InspectionChapter = Readonly<{
	frameIndex: number;
	frameId: Id;
	label: string;
	note?: string;
	time?: Readonly<{ kind: "logical"; tick: number } |
		{ kind: "wall"; iso8601: string }>;
}>;

export type InspectionEvidence = Readonly<{
	eventId: Id;
	event: SemanticEvent;
	origin: Origin;
	frameIndex: number;
	frameId: Id;
	stepLabel: string;
	source: Readonly<SourceIds>;
	description: string;
}>;

export type InspectionStateRow = Readonly<{
	entityId: Id;
	label: string;
	presentBefore: boolean;
	presentAfter: boolean;
	before: QueryCell;
	after: QueryCell;
}>;

export type InspectionClaim = Readonly<{
	claim: Claim;
	origin: Origin;
	modeledEvidence: readonly InspectionEvidence[];
	unmodeledUntilLater: number;
	explanation: string;
}>;

export type InspectionFocus = Readonly<{
	evidence: InspectionEvidence;
	/** Only explicit dependsOn edges, never inferred from timeline adjacency. */
	dependencies: readonly InspectionEvidence[];
	causality: "explicit" | "unmodeled";
	explanation: string;
	claims: readonly InspectionClaim[];
}>;

export type InspectionSelection = Readonly<{
	entityId: Id;
	label: string;
	path: Path;
	presentBefore: boolean;
	presentAfter: boolean;
	before: QueryCell;
	after: QueryCell;
	/** Exact overlapping writes through this frame, evaluated at the query path. */
	history: readonly HistoryEntry[];
}>;

export type InspectionRelation = Readonly<{
	relation: Relation;
	/** Only actual message events associated with this declared relation. */
	transfers: readonly InspectionEvidence[];
	explanation: string;
}>;

export type InspectionRequest = Readonly<{
	frameIndex: number;
	/** Previous committed frame by default; only forward comparisons permitted. */
	compareFromIndex?: number;
	entityId?: Id;
	path?: Path;
	relationId?: Id;
	eventId?: Id;
}>;

/** Pure renderer-independent context for Explain / Inspect. */
export type InspectionView = Readonly<{
	chapter: InspectionChapter;
	fromFrameId: Id;
	compareFromIndex: number;
	changes: readonly StateChange[];
	state: readonly InspectionStateRow[];
	selected?: InspectionSelection;
	/** Current step only. Initial frame has no step evidence. */
	stepEvidence: readonly InspectionEvidence[];
	relation?: InspectionRelation;
	focused?: InspectionFocus;
	/** All claims are editorial, even when reviewed or associated with events. */
	evidenceLimits: string;
}>;

type IndexedEvent = { readonly frameIndex: number; readonly frameId: Id; readonly label: string };
type InspectIndex = Readonly<{
	events: ReadonlyMap<Id, IndexedEvent>;
	origins: ReadonlyMap<Id, Origin>;
	relations: ReadonlyMap<Id, Relation>;
}>;
const indexes = new WeakMap<TraceInspector, InspectIndex>();

function indexFor(inspector: TraceInspector): InspectIndex {
	const known = indexes.get(inspector);
	if (known) return known;
	const { artifact } = inspectedTrace(inspector);
	const events = new Map<Id, IndexedEvent>();
	for (const [stepIndex, step] of artifact.steps.entries())
		for (const event of step.events)
			events.set(event.id, Object.freeze({
				frameIndex: stepIndex + 1, frameId: step.id, label: step.label,
			}));
	const result: InspectIndex = {
		events,
		origins: new Map(artifact.origins.map(origin => [origin.id, origin] as const)),
		relations: new Map(artifact.relations.map(relation => [relation.id, relation] as const)),
	};
	indexes.set(inspector, result);
	return result;
}

const freeze = <T>(value: T): Readonly<T> => Object.freeze(value);
const ids = (values: readonly Id[]): readonly Id[] =>
	freeze([...new Set(values)]);

function evidenceFor(event: SemanticEvent, index: InspectIndex): InspectionEvidence {
	const frame = index.events.get(event.id)!;
	const relationId = event.type === "message" ? event.relationId
		: event.type === "topology" && event.target === "relation"
			? event.targetId : undefined;
	const relation = relationId ? index.relations.get(relationId)! : undefined;
	const entityIds = event.type === "write" || event.type === "observation"
		? [event.entityId]
		: event.type === "topology" && event.target === "entity"
			? [event.targetId]
			: relation ? [relation.from, relation.to] : [];
	const source: SourceIds = {
		eventIds: ids([event.id]),
		...(entityIds.length ? { entityIds: ids(entityIds) } : {}),
		...(relationId ? { relationIds: ids([relationId]) } : {}),
	};
	const text = event.type === "message"
		? "Modeled message " + event.phase + " on relation " + event.relationId +
			", message " + event.messageId + ". No other phase or persistent write is implied."
		: event.type === "write"
			? "Explicit modeled write to " + event.entityId +
				" at " + JSON.stringify(event.path) + "."
			: event.type === "topology"
				? "Explicit modeled presence " + (event.present ? "on" : "off") +
					" for " + event.target + " " + event.targetId + "."
				: "Observation-family event for " + event.entityId +
					"; this observation does not commit a state write.";
	const origin = index.origins.get(event.originId)!;
	return freeze({
		eventId: event.id, event, origin,
		frameIndex: frame.frameIndex, frameId: frame.frameId,
		stepLabel: frame.label, source: freeze(source),
		description: text + " Declared origin " + origin.id + " (" + origin.kind +
			"); this provenance label is not independent verification.",
	});
}

/**
 * Pure inspection from the compiler-owned trace's indexed query API.
 *
 * All authored writes (including same-value writes), topology operations,
 * exact requested-path history and declared dependencies come from
 * inspectTrace; no snapshot deep-comparison or causal reconstruction occurs.
 * Future evidence cannot be shown as established in an earlier frame.
 */
export function projectInspection(
	inspector: TraceInspector, request: InspectionRequest,
): InspectionView {
	const index = indexFor(inspector); // rejects forged inspectors
	if (!request || typeof request !== "object" || Array.isArray(request))
		throw new TraceQueryError("$.request", "expected an inspection request");
	const { artifact, frames } = inspectedTrace(inspector);
	const frame = inspector.stateAt(request.frameIndex);
	const from = request.compareFromIndex ?? Math.max(0, request.frameIndex - 1);
	const previous = inspector.stateAt(from);
	// Inspector owns frame/index validation; chronological reversals fail.
	const changes = inspector.diff(from, request.frameIndex);
	const currentPresent = new Set(frame.presentEntityIds);
	const previousPresent = new Set(previous.presentEntityIds);
	const state: InspectionStateRow[] = artifact.entities.map(entity => freeze({
		entityId: entity.id, label: entity.label,
		presentBefore: previousPresent.has(entity.id),
		presentAfter: currentPresent.has(entity.id),
		before: previous.values[entity.id],
		after: frame.values[entity.id],
	}));

	let selected: InspectionSelection | undefined;
	if (request.entityId !== undefined) {
		// The inspector validates both IDs and safe typed JSON paths, and
		// distinguishes absent path, unknown cell and known JSON null.
		const path = request.path ?? [];
		const before = inspector.valueAt(from, request.entityId, path);
		const after = inspector.valueAt(request.frameIndex, request.entityId, path);
		const declared = artifact.entities.find(entity => entity.id === request.entityId)!;
		selected = freeze({
			entityId: declared.id, label: declared.label,
			path: freeze([...path]),
			presentBefore: previousPresent.has(declared.id),
			presentAfter: currentPresent.has(declared.id),
			before, after,
			history: freeze(inspector.history(declared.id, path).filter(entry =>
				entry.frameIndex <= request.frameIndex)),
		});
	} else if (request.path !== undefined)
		throw new TraceQueryError("$.entityId", "select an entity before querying a path");

	const step = request.frameIndex > 0
		? artifact.steps[request.frameIndex - 1] : undefined;
	const stepEvidence = freeze((step?.events ?? []).map(event => evidenceFor(event, index)));

	let relation: InspectionRelation | undefined;
	if (request.relationId !== undefined) {
		const transfers = inspector.transfersFor(request.relationId).filter(event =>
			index.events.get(event.id)!.frameIndex <= request.frameIndex);
		const authoredRelation = index.relations.get(request.relationId)!;
		relation = freeze({
			relation: authoredRelation,
			transfers: freeze(transfers.map(event => evidenceFor(event, index))),
			explanation: "These are only explicitly modeled message phases on relation " +
				authoredRelation.id + ". A sent event alone cannot establish receipt, " +
				"acknowledgement, processing or any destination state write.",
		});
	}

	let focused: InspectionFocus | undefined;
	if (request.eventId !== undefined) {
		const fact = inspector.eventById(request.eventId);
		const at = index.events.get(fact.id)!;
		if (at.frameIndex > request.frameIndex)
			throw new TraceQueryError("$.eventId",
				"future event evidence cannot be inspected at the selected frame");
		const evidence = evidenceFor(fact, index);
		const causal = inspector.causalEvidenceOf(fact.id);
		const claims = inspector.claimsForEvent(fact.id).map(claim => {
			const visible = claim.evidenceEventIds.filter(id =>
				index.events.get(id)!.frameIndex <= request.frameIndex);
			const pending = claim.evidenceEventIds.length - visible.length;
			return freeze({
				claim,
				origin: index.origins.get(claim.originId)!,
				modeledEvidence: freeze(visible.map(id =>
					evidenceFor(inspector.eventById(id), index))),
				unmodeledUntilLater: pending,
				explanation: "Editorial " + claim.kind + " claim (" + claim.review +
					"), source kind " + index.origins.get(claim.originId)!.kind + ". " +
					(pending
						? pending + " cited event(s) occur after this frame, so the claim has incomplete modeled evidence. "
						: "The cited events are in scope; their existence does not independently verify this claim. ") +
					"Editorial review is not scientific proof or confirmation of causality.",
			});
		});
		focused = freeze({
			evidence,
			dependencies: freeze(causal.dependencies.map(event => evidenceFor(event, index))),
			causality: causal.status,
			explanation: causal.explanation,
			claims: freeze(claims),
		});
	}

	return freeze({
		chapter: freeze({
			frameIndex: request.frameIndex,
			frameId: frames[request.frameIndex].id,
			label: step?.label ?? "Initial state",
			...(step?.note ? { note: step.note } : {}),
			...(step?.time ? { time: step.time } : {}),
		}),
		fromFrameId: frames[from].id,
		compareFromIndex: from,
		changes,
		state: freeze(state),
		...(selected ? { selected } : {}),
		stepEvidence,
		...(relation ? { relation } : {}),
		...(focused ? { focused } : {}),
		evidenceLimits: "Ordered steps are not verified durations or physical event order. " +
			"Only explicit writes alter modeled values; only explicit dependencies are " +
			"modeled causal edges. Reviewed and other origin labels are editorial metadata, " +
			"not independent proof. Missing evidence remains unmodeled.",
	});
}
