import {
	ARTIFACT_LIMITS,
	type ReadonlyCell,
	type CompiledFrame,
	type CompiledTrace,
	type Id,
	type ReadonlyJsonValue,
	type Path,
	type ReadonlyRelation,
	type ReadonlySemanticEvent,
	type StateSnapshot,
	type ValidatedArtifact,
} from "./model.js";
import { ArtifactValidationError, validateArtifact } from "./validator.js";

/** A compiler-stage error with an exact path in the authored artifact. */
export class ArtifactCompilationError extends ArtifactValidationError {
	constructor(path: string, message: string) {
		super(path, message);
		this.name = "ArtifactCompilationError";
	}
}

function reject(path: string, message: string): never {
	throw new ArtifactCompilationError(path, message);
}

function has(value: object, key: string | number): boolean {
	return Object.prototype.hasOwnProperty.call(value, key);
}

function dataRecord<T>(): Record<string, T> {
	return Object.create(null) as Record<string, T>;
}

/**
 * Apply an already-checked disjoint write trie with a single copy of each
 * touched container. The input subtree is immutable (validated and frozen);
 * no intermediate arrays or records are cloned m times for m sibling writes.
 *
 * Work is proportional to the sizes of touched containers plus the number of
 * path nodes, not array length multiplied by the number of indexed writes.
 */
function applyNestedBatch(current: ReadonlyJsonValue, target: TargetNode): ReadonlyJsonValue {
	if (target.write !== undefined) {
		// Root/whole-entity writes are handled by the caller. Nested leaves
		// were checked to be known before being placed into the trie.
		if (target.write.status !== "known")
			reject("$", "nested write unexpectedly contains an unknown value");
		return target.write.value;
	}
	if (Array.isArray(current)) {
		const copy: ReadonlyJsonValue[] = new Array(current.length);
		for (let i = 0; i < current.length; i++) {
			const child = target.descendants.get("n:" + i);
			Object.defineProperty(copy, String(i), {
				value: child ? applyNestedBatch(current[i], child) : current[i],
				enumerable: true,
				configurable: true,
				writable: true,
			});
		}
		Object.freeze(copy);
		return copy;
	}
	if (current !== null && typeof current === "object") {
		const copy = dataRecord<ReadonlyJsonValue>();
		for (const key of Object.keys(current)) {
			const child = target.descendants.get("s:" + key);
			const value = (current as Readonly<Record<string, ReadonlyJsonValue>>)[key];
			copy[key] = child ? applyNestedBatch(value, child) : value;
		}
		return Object.freeze(copy);
	}
	// assertWritable checked every path against the same previous frame.
	reject("$", "nested target is not a known compatible container");
}

function assertWritable(
	cell: ReadonlyCell,
	path: Path,
	source: string,
): void {
	if (path.length === 0) return;
	if (cell.status === "unknown")
		reject(source + ".path", "cannot patch a nested path of an unknown entity");
	let value: ReadonlyJsonValue = cell.value;
	for (let i = 0; i < path.length; i++) {
		const segment = path[i];
		const at = source + ".path[" + i + "]";
		if (typeof segment === "number") {
			if (!Array.isArray(value))
				reject(at, "array index requires an existing known array parent");
			if (segment >= value.length || !has(value, segment))
				reject(at, "array index is out of bounds; array growth is not supported");
			value = value[segment];
		} else {
			if (value === null || typeof value !== "object" || Array.isArray(value))
				reject(at, "record key requires an existing known record parent");
			if (!has(value, segment))
				reject(at, "record key is absent; implicit creation is not supported");
			value = (value as Readonly<Record<string, ReadonlyJsonValue>>)[segment];
		}
	}
}

/** A nested replacement must keep every compiled value reachable by a legal
 * inspector path. Validated authored JSON already has bounded nesting; the
 * write path plus replacement depth must also fit that ceiling. */
function assertReplacementDepth(value: ReadonlyJsonValue, depth: number, source: string): void {
	if (depth > ARTIFACT_LIMITS.jsonDepth)
		reject(source + ".value", "compiled value nesting exceeds query depth 32");
	if (value !== null && typeof value === "object")
		for (const child of Object.values(value))
			assertReplacementDepth(child, depth + 1, source);
}

type TargetNode = {
	write?: ReadonlyCell;
	descendants: Map<string, TargetNode>;
};

function targetNode(): TargetNode {
	return { descendants: new Map() };
}

/**
 * The trie is the SSOT for a step's pending values and overlapping-path
 * detection. Each leaf owns exactly one authored ReadonlyCell.
 */
function reserveTarget(root: TargetNode, path: Path, value: ReadonlyCell, source: string): void {
	let node = root;
	for (const segment of path) {
		if (node.write !== undefined)
			reject(source + ".path", "overlapping writes in the same atomic step");
		const key = (typeof segment === "number" ? "n:" : "s:") + segment;
		let child = node.descendants.get(key);
		if (!child) {
			child = targetNode();
			node.descendants.set(key, child);
		}
		node = child;
	}
	if (node.write !== undefined || node.descendants.size)
		reject(source + ".path", "overlapping writes in the same atomic step");
	node.write = value;
}

/**
 * A full-frame traversal is charged for every frame, even when structural
 * sharing makes its actual stored representation small. Known/frozen values
 * have memoized sizes but their expanded costs are never discounted.
 */
class TraceBudget {
	private used = 0;
	private readonly cachedSizes = new WeakMap<object, number>();

	charge(count: number, source: string): void {
		this.used += count;
		if (!Number.isSafeInteger(this.used) || this.used > ARTIFACT_LIMITS.traceUnits)
			reject(source, "compiled expanded trace exceeds 8,000,000 traversal units");
	}

	private expanded(value: unknown): number {
		if (value === null || typeof value !== "object") return 1;
		const cached = this.cachedSizes.get(value);
		if (cached !== undefined) return cached;
		let count = 1;
		if (Array.isArray(value)) {
			for (let i = 0; i < value.length; i++)
				count += 1 + this.expanded(value[i]);
		} else {
			for (const key of Object.keys(value))
				count += 1 + this.expanded((value as Record<string, unknown>)[key]);
		}
		this.cachedSizes.set(value, count);
		return count;
	}

	frame(frame: CompiledFrame): void {
		// Each array element consumes two units: one visited slot and one
		// visited string primitive. Reuse the same expansion rule for all
		// compiler-owned ID arrays and canonical cell values.
		let count = this.expanded(frame.eventIds);
		count += this.expanded(frame.snapshot.presentEntityIds);
		count += this.expanded(frame.snapshot.presentRelationIds);
		for (const id of Object.keys(frame.snapshot.values))
			count += 1 + this.expanded(frame.snapshot.values[id]);
		this.charge(count, "frames[" + frame.index + "]");
	}
}

function snapshot(
	values: Readonly<Record<Id, ReadonlyCell>>,
	presentEntities: ReadonlySet<Id>,
	presentRelations: ReadonlySet<Id>,
	artifact: ValidatedArtifact,
): Readonly<StateSnapshot> {
	return Object.freeze({
		values,
		presentEntityIds: Object.freeze(artifact.entities.filter((entity) =>
			presentEntities.has(entity.id)).map((entity) => entity.id)),
		presentRelationIds: Object.freeze(artifact.relations.filter((relation) =>
			presentRelations.has(relation.id)).map((relation) => relation.id)),
	});
}

function frame(
	index: number,
	id: string,
	label: string,
	events: readonly ReadonlySemanticEvent[],
	state: Readonly<StateSnapshot>,
): CompiledFrame {
	return Object.freeze({
		id,
		index,
		label,
		eventIds: Object.freeze(events.map((event) => event.id)),
		snapshot: state,
	});
}

function checkSent(
	relation: ReadonlyRelation,
	presentRelations: ReadonlySet<Id>,
	presentEntities: ReadonlySet<Id>,
	source: string,
	stage: string,
): void {
	if (!presentRelations.has(relation.id) ||
		!presentEntities.has(relation.from) ||
		!presentEntities.has(relation.to))
		reject(source, "sent message requires a present relation and both endpoints " +
			stage + " its atomic step");
}

/**
 * CompiledTrace is an in-process derived object, never a deserialization
 * format. Only traces created by this compiler are eligible for indexing.
 * Weak ownership prevents a forged JSON object with matching fields from
 * crossing the inspector boundary (no external compiled-trace reader yet).
 */
const ownedTraces = new WeakSet<object>();

/** Internal trust check; deliberately not exported by the package entrypoint. */
export function assertOwnedTrace(input: CompiledTrace): void {
	if (typeof input !== "object" || input === null || !ownedTraces.has(input))
		reject("$", "untrusted compiled trace; recompile from a validated artifact");
}

/**
 * Compile semantic schema-2 state, not source code or inferred effects.
 *
 * Validation is mandatory at this public boundary; external compiled frames
 * are not admissible. Steps commit atomically in declaration order. Within a
 * step, operations are checked against the same preceding state, and authored
 * event order has no causal or physical-time semantics.
 */
export function compileArtifact(input: ValidatedArtifact): CompiledTrace {
	const artifact = validateArtifact(input);
	const relations = new Map(artifact.relations.map((relation) => [relation.id, relation]));
	const budget = new TraceBudget();

	const initialValues = dataRecord<ReadonlyCell>();
	const initialPresentEntities = new Set<Id>();
	const initialPresentRelations = new Set<Id>();
	for (const entity of artifact.entities) {
		initialValues[entity.id] = artifact.initialState[entity.id];
		if (entity.initiallyPresent !== false) initialPresentEntities.add(entity.id);
	}
	for (const relation of artifact.relations)
		if (relation.initiallyPresent !== false) initialPresentRelations.add(relation.id);

	let values: Readonly<Record<Id, ReadonlyCell>> = Object.freeze(initialValues);
	let presentEntities: ReadonlySet<Id> = initialPresentEntities;
	let presentRelations: ReadonlySet<Id> = initialPresentRelations;

	const initial = frame(0, "@initial", "Initial state", [],
		snapshot(values, presentEntities, presentRelations, artifact));
	const frames: CompiledFrame[] = [initial];
	budget.frame(initial);

	for (const [stepIndex, step] of artifact.steps.entries()) {
		const stepSource = "$.steps[" + stepIndex + "]";
		const topologyByTarget = new Map<string, boolean>();
		const writesByEntity = new Map<Id, TargetNode>();
		const nextEntities = new Set(presentEntities);
		const nextRelations = new Set(presentRelations);

		for (const [eventIndex, event] of step.events.entries()) {
			const source = stepSource + ".events[" + eventIndex + "]";
			budget.charge(1, source);
			switch (event.type) {
				case "write": {
					// Validate nested paths against the original pre-step state.
					assertWritable(values[event.entityId], event.path, source);
					let targets = writesByEntity.get(event.entityId);
					if (!targets) {
						targets = targetNode();
						writesByEntity.set(event.entityId, targets);
					}
					if (event.path.length > 0 && event.value.status !== "known")
						reject(source + ".value", "nested write requires a known JSON value");
					if (event.path.length && event.value.status === "known")
						assertReplacementDepth(event.value.value, event.path.length, source);
					reserveTarget(targets, event.path, event.value, source);
					break;
				}
				case "topology": {
					const key = event.target + ":" + event.targetId;
					const previous = topologyByTarget.get(key);
					if (previous !== undefined && previous !== event.present)
						reject(source, "contradictory topology updates in the same atomic step");
					topologyByTarget.set(key, event.present);
					if (event.target === "entity") {
						if (event.present) nextEntities.add(event.targetId);
						else nextEntities.delete(event.targetId);
					} else {
						if (event.present) nextRelations.add(event.targetId);
						else nextRelations.delete(event.targetId);
					}
					break;
				}
				case "observation":
				case "message":
					// Evidence alone never writes state or changes modeled existence.
					break;
			}
		}

		// A successful send cannot rely on an endpoint activated in the same
		// step, nor on a relation/endpoint removed during that step.
		for (const [eventIndex, event] of step.events.entries()) {
			if (event.type !== "message" || event.phase !== "sent") continue;
			const source = stepSource + ".events[" + eventIndex + "]";
			const relation = relations.get(event.relationId);
			if (!relation) reject(source, "undeclared message relation");
			checkSent(relation, presentRelations, presentEntities, source, "before");
			checkSent(relation, nextRelations, nextEntities, source, "after");
		}

		let committedValues = values;
		if (writesByEntity.size > 0) {
			const nextValues = dataRecord<ReadonlyCell>();
			for (const entity of artifact.entities) nextValues[entity.id] = values[entity.id];
			for (const [entityId, target] of writesByEntity) {
				if (target.write !== undefined) {
					nextValues[entityId] = target.write;
					continue;
				}
				const previous = values[entityId];
				if (previous.status !== "known")
					reject("$", "nested target unexpectedly has unknown state");
				nextValues[entityId] = Object.freeze({
					status: "known" as const,
					value: applyNestedBatch(previous.value, target),
				});
			}
			committedValues = Object.freeze(nextValues);
		}

		// Topology is modeled existence, not renderer collapse or focus.
		// No mutations escape on a failed step; the current snapshot is intact.
		if (topologyByTarget.size) {
			presentEntities = nextEntities;
			presentRelations = nextRelations;
		}
		values = committedValues;
		const result = frame(stepIndex + 1, step.id, step.label, step.events,
			snapshot(values, presentEntities, presentRelations, artifact));
		budget.frame(result);
		frames.push(result);
	}

	const trace: CompiledTrace = Object.freeze({
		schemaVersion: 2 as const,
		artifact,
		frames: Object.freeze(frames),
	});
	ownedTraces.add(trace);
	return trace;
}
