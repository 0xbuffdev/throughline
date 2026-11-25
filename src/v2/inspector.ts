import {
	type CausalEvidence,
	type ReadonlyCell,
	type ReadonlyClaim,
	type CompiledTrace,
	type HistoryEntry,
	type Id,
	type ReadonlyJsonValue,
	type Path,
	type QueryCell,
	type ReadonlyRelation,
	type ReadonlySemanticEvent,
	type StateChange,
	type StateSnapshot,
	type PresenceChange,
	type TraceInspector,
	type WriteChange,
} from "./model.js";
import { assertOwnedTrace } from "./compiler.js";
import { assertQueryPath } from "./validator.js";

/** Invalid frame indices and undeclared model IDs are query errors, not absence. */
export class TraceQueryError extends Error {
	constructor(
		public readonly path: string,
		message: string,
	) {
		super(path + ": " + message);
		this.name = "TraceQueryError";
	}
}

function reject(path: string, message: string): never {
	throw new TraceQueryError(path, message);
}

const ABSENT = Object.freeze({ status: "absent" as const });

function has(value: object, key: string | number): boolean {
	return Object.prototype.hasOwnProperty.call(value, key);
}

/**
 * Reading an unknown whole-entity cell at a nested path stays unknown; a
 * missing property of a known value is absent, and known null stays known.
 * Validated JSON values are already immutable, including nested containers.
 */
function readCell(cell: ReadonlyCell, path: Path): QueryCell {
	if (!path.length || cell.status === "unknown") return cell;
	let value: ReadonlyJsonValue = cell.value;
	for (const segment of path) {
		if (typeof segment === "number") {
			if (!Array.isArray(value) || !has(value, segment)) return ABSENT;
			value = value[segment];
		} else {
			if (value === null || typeof value !== "object" ||
				Array.isArray(value) || !has(value, segment)) return ABSENT;
			value = (value as Readonly<Record<string, ReadonlyJsonValue>>)[segment];
		}
	}
	return Object.freeze({ status: "known" as const, value });
}

/** A write affects a queried path when one path is a prefix of the other. */
function intersects(left: Path, right: Path): boolean {
	for (let i = 0; i < Math.min(left.length, right.length); i++)
		if (left[i] !== right[i]) return false;
	return true;
}

/**
 * Inspector instances are produced from compiler-owned traces, not from a
 * JSON-looking duck type. View projection never trusts external functions.
 */
const ownedInspectors = new WeakSet<object>();
const inspectedTraces = new WeakMap<object, CompiledTrace>();

/** Internal trusted accessor: view projections reuse the exact validated artifact. */
export function inspectedTrace(input: TraceInspector): CompiledTrace {
	assertOwnedInspector(input);
	return inspectedTraces.get(input)!;
}

export function assertOwnedInspector(input: TraceInspector): void {
	if (input === null || typeof input !== "object" || !ownedInspectors.has(input))
		reject("$.inspector", "untrusted trace inspector; recompile and inspect a validated artifact");
}

/**
 * Build one private index over an immutable compiler-produced trace.
 *
 * No JSON blob claiming to be a CompiledTrace may be inspected. The caller
 * must recompile its validated VisualArtifact using compileArtifact.
 * Event and claim references are the original detached, frozen authored data.
 */
export function inspectTrace(trace: CompiledTrace): TraceInspector {
	assertOwnedTrace(trace);
	const { artifact, frames } = trace;
	const entities = new Set(artifact.entities.map((entity) => entity.id));
	const relations = new Map(artifact.relations.map((relation) =>
		[relation.id, relation] as const));
	const eventsById = new Map<Id, ReadonlySemanticEvent>();
	const eventsByEntity = new Map<Id, ReadonlySemanticEvent[]>();
	const transfersByRelation = new Map<Id, ReadonlySemanticEvent[]>();
	const relationsByEntity = new Map<Id, ReadonlyRelation[]>();
	const writesByEntity = new Map<Id, WriteChange[]>();
	const dependenciesByEvent = new Map<Id, readonly ReadonlySemanticEvent[]>();
	const evidenceByEvent = new Map<Id, CausalEvidence>();
	const claimsByEvent = new Map<Id, ReadonlyClaim[]>();
	const changesByFrame: (readonly StateChange[])[] = [Object.freeze([])];

	for (const entity of artifact.entities) {
		eventsByEntity.set(entity.id, []);
		relationsByEntity.set(entity.id, []);
		writesByEntity.set(entity.id, []);
	}
	for (const relation of artifact.relations) {
		transfersByRelation.set(relation.id, []);
		relationsByEntity.get(relation.from)!.push(relation);
		if (relation.to !== relation.from)
			relationsByEntity.get(relation.to)!.push(relation);
	}

	for (const [stepIndex, step] of artifact.steps.entries()) {
		const frameIndex = stepIndex + 1;
		const before = frames[frameIndex - 1].snapshot;
		const after = frames[frameIndex].snapshot;
		const previousEntities = new Set(before.presentEntityIds);
		const nextEntities = new Set(after.presentEntityIds);
		const previousRelations = new Set(before.presentRelationIds);
		const nextRelations = new Set(after.presentRelationIds);
		const changes: StateChange[] = [];

		for (const event of step.events) {
			eventsById.set(event.id, event);

			// Entity events include relation-linked authored facts for both
			// endpoints. This indexes *association*, never inferred delivery,
			// persistence, or causality.
			const associated = new Set<Id>();
			if (event.type === "write" || event.type === "observation")
				associated.add(event.entityId);
			else if (event.type === "topology" && event.target === "entity")
				associated.add(event.targetId);
			else if (event.type === "message" ||
				(event.type === "topology" && event.target === "relation")) {
				const id = event.type === "message" ? event.relationId : event.targetId;
				const relation = relations.get(id)!;
				associated.add(relation.from);
				associated.add(relation.to);
			}
			for (const entityId of associated) eventsByEntity.get(entityId)!.push(event);

			if (event.type === "message") {
				transfersByRelation.get(event.relationId)!.push(event);
			} else if (event.type === "write") {
				const change: WriteChange = Object.freeze({
					kind: "write",
					frameId: frames[frameIndex].id,
					frameIndex,
					stepId: step.id,
					eventId: event.id,
					originId: event.originId,
					entityId: event.entityId,
					path: event.path,
					before: readCell(before.values[event.entityId], event.path),
					after: readCell(after.values[event.entityId], event.path),
				});
				changes.push(change);
				writesByEntity.get(event.entityId)!.push(change);
			} else if (event.type === "topology") {
				const previous = event.target === "entity" ?
					previousEntities : previousRelations;
				const next = event.target === "entity" ? nextEntities : nextRelations;
				const change: PresenceChange = Object.freeze({
					kind: "presence",
					frameId: frames[frameIndex].id,
					frameIndex,
					stepId: step.id,
					eventId: event.id,
					originId: event.originId,
					target: event.target,
					targetId: event.targetId,
					before: previous.has(event.targetId),
					after: next.has(event.targetId),
				});
				changes.push(change);
			}
		}
		changesByFrame.push(Object.freeze(changes));
	}

	// Provenance references are resolved once. Empty lists mean the author
	// did not declare causality, not that a different cause was discovered.
	for (const event of eventsById.values()) {
		const dependencies = Object.freeze(
			[...new Set(event.dependsOn ?? [])].map((id) => eventsById.get(id)!));
		dependenciesByEvent.set(event.id, dependencies);
		evidenceByEvent.set(event.id, Object.freeze({
			status: dependencies.length ? "explicit" as const : "unmodeled" as const,
			dependencies,
			explanation: dependencies.length
				? "Only these explicitly declared dependencies are modeled; other causes are not inferred or verified."
				: "No explicit causal dependency is modeled for this event.",
		}));
		claimsByEvent.set(event.id, []);
	}
	for (const claim of artifact.claims ?? [])
		for (const eventId of new Set(claim.evidenceEventIds))
			claimsByEvent.get(eventId)!.push(claim);

	// Expose frozen views, never the mutable Maps or index-building arrays.
	const frozenEvents = new Map<Id, readonly ReadonlySemanticEvent[]>();
	const frozenTransfers = new Map<Id, readonly ReadonlySemanticEvent[]>();
	const frozenRelations = new Map<Id, readonly ReadonlyRelation[]>();
	const frozenWrites = new Map<Id, readonly HistoryEntry[]>();
	const frozenClaims = new Map<Id, readonly ReadonlyClaim[]>();
	for (const [id, items] of eventsByEntity) frozenEvents.set(id, Object.freeze(items));
	for (const [id, items] of transfersByRelation) frozenTransfers.set(id, Object.freeze(items));
	for (const [id, items] of relationsByEntity) frozenRelations.set(id, Object.freeze(items));
	for (const [id, items] of writesByEntity) frozenWrites.set(id, Object.freeze(items));
	for (const [id, items] of claimsByEvent) frozenClaims.set(id, Object.freeze(items));

	const frameAt = (frameIndex: number): Readonly<StateSnapshot> => {
		if (!Number.isSafeInteger(frameIndex) ||
			frameIndex < 0 || frameIndex >= frames.length)
			reject("$.frameIndex", "frame must be a valid zero-based index");
		return frames[frameIndex].snapshot;
	};
	const entityAt = (entityId: Id): void => {
		if (!entities.has(entityId)) reject("$.entityId", "undeclared entity: " + entityId);
	};
	const relationAt = (relationId: Id): void => {
		if (!relations.has(relationId))
			reject("$.relationId", "undeclared relation: " + relationId);
	};
	const eventAt = (eventId: Id): ReadonlySemanticEvent => {
		const event = eventsById.get(eventId);
		if (!event) reject("$.eventId", "undeclared event: " + eventId);
		return event;
	};

	const inspector: TraceInspector = Object.freeze({
		frameCount: frames.length,
		stateAt: frameAt,
		valueAt(frameIndex: number, entityId: Id, path: Path = []): QueryCell {
			const state = frameAt(frameIndex);
			entityAt(entityId);
			assertQueryPath(path);
			return readCell(state.values[entityId], path);
		},
		diff(from: number, to: number): readonly StateChange[] {
			frameAt(from);
			frameAt(to);
			if (from > to)
				reject("$.fromIndex", "diff requires fromIndex <= toIndex");
			const result: StateChange[] = [];
			for (let i = from + 1; i <= to; i++)
				result.push(...changesByFrame[i]);
			return Object.freeze(result);
		},
		history(entityId: Id, path?: Path): readonly HistoryEntry[] {
			entityAt(entityId);
			const writes = frozenWrites.get(entityId)!;
			if (path === undefined) return writes;
			assertQueryPath(path);
			// Filtering alone would incorrectly report values at the event
			// target. Instead evaluate the *requested* location in the prior
			// and committed frames, retaining the authored event path/IDs.
			return Object.freeze(writes
				.filter((entry) => intersects(entry.path, path))
				.map((entry) => Object.freeze({
					...entry,
					before: readCell(frames[entry.frameIndex - 1].snapshot.values[entityId], path),
					after: readCell(frames[entry.frameIndex].snapshot.values[entityId], path),
				})));
		},
		eventsFor(entityId: Id): readonly ReadonlySemanticEvent[] {
			entityAt(entityId);
			return frozenEvents.get(entityId)!;
		},
		transfersFor(relationId: Id): readonly ReadonlySemanticEvent[] {
			relationAt(relationId);
			return frozenTransfers.get(relationId)!;
		},
		dependenciesOf(eventId: Id): readonly ReadonlySemanticEvent[] {
			eventAt(eventId);
			return dependenciesByEvent.get(eventId)!;
		},
		causalEvidenceOf(eventId: Id): CausalEvidence {
			eventAt(eventId);
			return evidenceByEvent.get(eventId)!;
		},
		eventById: eventAt,
		claimsForEvent(eventId: Id): readonly ReadonlyClaim[] {
			eventAt(eventId);
			return frozenClaims.get(eventId)!;
		},
		relationsFor(entityId: Id): readonly ReadonlyRelation[] {
			entityAt(entityId);
			return frozenRelations.get(entityId)!;
		},
	});
	ownedInspectors.add(inspector);
	inspectedTraces.set(inspector, trace);
	return inspector;
}
