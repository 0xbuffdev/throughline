/**
 * Throughline schema 2: authored semantic facts, not compiled frames or presentation.
 *
 * Normative contract: context/repos/throughline/specs/0004-universal-visualization-engine.md
 * §10 (U-DEC-01–05). These types coexist with the v1 implementation only while
 * TL-U03–TL-U10 migrate the compiler, projections and authoring surfaces.
 */
export type JsonValue =
	| null
	| boolean
	| number
	| string
	| JsonValue[]
	| { [key: string]: JsonValue };

export type Id = string;
export type Path = readonly (string | number)[];
export type Cell =
	| { status: "known"; value: JsonValue }
	| { status: "unknown"; reason?: string };

export type OriginKind =
	| "authored"
	| "computed"
	| "simulated"
	| "observed"
	| "ai-proposed";
export type Origin = {
	id: Id;
	kind: OriginKind;
	description?: string;
	reference?: string;
};
export type Entity = {
	id: Id;
	label: string;
	kind?: string;
	groupId?: Id;
	initiallyPresent?: boolean;
};
export type Relation = {
	id: Id;
	from: Id;
	to: Id;
	label?: string;
	kind?: string;
	initiallyPresent?: boolean;
};
export type Group = { id: Id; label: string; parentId?: Id };

export type EventBase = {
	id: Id;
	originId: Id;
	dependsOn?: Id[];
};
export type SemanticEvent = EventBase &
	(
		| { type: "write"; entityId: Id; path: Path; value: Cell }
		| {
				type: "topology";
				target: "entity" | "relation";
				targetId: Id;
				present: boolean;
		  }
		| {
				type: "message";
				relationId: Id;
				messageId: Id;
				phase: "sent" | "received" | "acknowledged" | "processed";
				payload?: JsonValue;
		  }
		| { type: "observation"; entityId: Id; value: Cell }
	);
export type Step = {
	id: Id;
	label: string;
	events: SemanticEvent[];
	note?: string;
	focusEntityIds?: Id[];
	time?:
		| { kind: "logical"; tick: number }
		| { kind: "wall"; iso8601: string };
};
export type Claim = {
	id: Id;
	text: string;
	kind: "causal" | "assumption" | "explanation";
	originId: Id;
	evidenceEventIds: Id[];
	review: "unreviewed" | "reviewed";
};
export type ViewHint = {
	kind: "graph" | "sequence" | "state-table";
	priority: number;
};
export type VisualArtifact = {
	schemaVersion: 2;
	id: Id;
	title?: string;
	origins: Origin[];
	groups?: Group[];
	entities: Entity[];
	relations: Relation[];
	initialState: Record<Id, Cell>;
	steps: Step[];
	claims?: Claim[];
	views?: ViewHint[];
};

/** Independent of npm SemVer and intentionally incompatible with v1 artifacts. */
export const ARTIFACT_SCHEMA_VERSION = 2 as const;

/** Normative §10 ceilings. Limits are cumulative, not promises of max×max input. */
export const ARTIFACT_LIMITS = Object.freeze({
	artifactBytes: 4 * 1024 * 1024,
	validationUnits: 1_000_000,
	traceUnits: 8_000_000,
	jsonDepth: 32,
	entities: 200,
	relations: 1_000,
	groups: 200,
	steps: 2_000,
	events: 10_000,
	claims: 1_000,
});

/**
 * Compiled frames are derived state, never independently authored input.
 * A snapshot is the committed state after the entire corresponding step.
 */
export type StateSnapshot = {
	values: Readonly<Record<Id, Cell>>;
	presentEntityIds: readonly Id[];
	presentRelationIds: readonly Id[];
};
export type CompiledFrame = {
	id: string;
	index: number;
	label: string;
	eventIds: readonly Id[];
	snapshot: Readonly<StateSnapshot>;
};
export type CompiledTrace = {
	schemaVersion: 2;
	artifact: Readonly<VisualArtifact>;
	frames: readonly CompiledFrame[];
};

/** Query-only state distinct from a known JSON null or unknown entity cell. */
export type QueryCell = Cell | { readonly status: "absent" };

export type WriteChange = {
	readonly kind: "write";
	readonly direction: "forward" | "backward";
	readonly frameIndex: number;
	readonly stepId: Id;
	readonly eventId: Id;
	readonly originId: Id;
	readonly entityId: Id;
	readonly path: Path;
	readonly before: QueryCell;
	readonly after: QueryCell;
};

export type TopologyChange = {
	readonly kind: "topology";
	readonly direction: "forward" | "backward";
	readonly frameIndex: number;
	readonly stepId: Id;
	readonly eventId: Id;
	readonly originId: Id;
	readonly target: "entity" | "relation";
	readonly targetId: Id;
	readonly beforePresent: boolean;
	readonly afterPresent: boolean;
};

/** Every entry identifies an explicit event; unchanged-value writes still count. */
export type StateChange = WriteChange | TopologyChange;
/** History is authored write evidence, not inferred state changes. */
export type HistoryEntry = WriteChange;

export type CausalEvidence = {
	readonly status: "explicit" | "unmodeled";
	readonly dependencies: readonly SemanticEvent[];
	readonly explanation: string;
};

/**
 * Read-only, pure indexed inspection of a compiler-owned schema-2 trace.
 * No method interprets event order as physical time or inferred causality.
 */
export type TraceInspector = {
	readonly frameCount: number;
	stateAt(frameIndex: number): Readonly<StateSnapshot>;
	valueAt(frameIndex: number, entityId: Id, path?: Path): QueryCell;
	diff(from: number, to: number): readonly StateChange[];
	history(entityId: Id, path?: Path): readonly HistoryEntry[];
	eventsFor(entityId: Id): readonly SemanticEvent[];
	transfersFor(relationId: Id): readonly SemanticEvent[];
	dependenciesOf(eventId: Id): readonly SemanticEvent[];
	causalEvidenceOf(eventId: Id): CausalEvidence;
	eventById(eventId: Id): SemanticEvent;
	claimsForEvent(eventId: Id): readonly Claim[];
	relationsFor(entityId: Id): readonly Relation[];
};
