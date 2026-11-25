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

/**
 * Read-side JSON and semantic facts. Keep recursive JSON explicit: a
 * conditional mapped type on JsonValue can exceed TS instantiation depth.
 * Mutable authored values are structurally assignable to these types.
 */
export type ReadonlyJsonValue =
	| null | boolean | number | string
	| readonly ReadonlyJsonValue[]
	| { readonly [key: string]: ReadonlyJsonValue };
export type ReadonlyCell =
	| Readonly<{ status: "known"; value: ReadonlyJsonValue }>
	| Readonly<{ status: "unknown"; reason?: string }>;
export type ReadonlyOrigin = Readonly<Origin>;
export type ReadonlyRelation = Readonly<Relation>;
export type ReadonlyClaim = Readonly<Omit<Claim, "evidenceEventIds"> & {
	evidenceEventIds: readonly Id[];
}>;
export type ReadonlySemanticEvent = Readonly<Omit<EventBase, "dependsOn"> & {
	dependsOn?: readonly Id[];
}> & (
	| Readonly<{ type: "write"; entityId: Id; path: Path; value: ReadonlyCell }>
	| Readonly<Omit<Extract<SemanticEvent, { type: "topology" }>, keyof EventBase>>
	| Readonly<Omit<Extract<SemanticEvent, { type: "message" }>, keyof EventBase | "payload"> & {
		payload?: ReadonlyJsonValue;
	}>
	| Readonly<{ type: "observation"; entityId: Id; value: ReadonlyCell }>
);
export type ValidatedArtifact = Readonly<{
	schemaVersion: 2;
	id: Id;
	title?: string;
	origins: readonly ReadonlyOrigin[];
	groups?: readonly Readonly<Group>[];
	entities: readonly Readonly<Entity>[];
	relations: readonly ReadonlyRelation[];
	initialState: Readonly<Record<Id, ReadonlyCell>>;
	steps: readonly Readonly<{
		id: Id;
		label: string;
		events: readonly ReadonlySemanticEvent[];
		note?: string;
		focusEntityIds?: readonly Id[];
		time?: Readonly<NonNullable<Step["time"]>>;
	}>[];
	claims?: readonly ReadonlyClaim[];
	views?: readonly Readonly<ViewHint>[];
}>;

/** Internal readonly-preserving guard; Array.isArray otherwise narrows to any[]. */
export function isReadonlyJsonArray(value: ReadonlyJsonValue): value is readonly ReadonlyJsonValue[] {
	return Array.isArray(value);
}

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
	readonly values: Readonly<Record<Id, ReadonlyCell>>;
	readonly presentEntityIds: readonly Id[];
	readonly presentRelationIds: readonly Id[];
};
export type CompiledFrame = {
	readonly id: string;
	readonly index: number;
	readonly label: string;
	readonly eventIds: readonly Id[];
	readonly snapshot: StateSnapshot;
};
export type CompiledTrace = {
	readonly schemaVersion: 2;
	readonly artifact: ValidatedArtifact;
	readonly frames: readonly CompiledFrame[];
};

/** Query-only state distinct from a known JSON null or unknown entity cell. */
export type QueryCell = ReadonlyCell | { readonly status: "absent" };

/**
 * An authored write at a committed step. For a path-filtered history, `path`
 * remains the original authored target, while before/after refer to the
 * requested query path (Specification 0004 §12.2).
 */
export type HistoryEntry = {
	readonly frameId: string;
	readonly frameIndex: number;
	readonly stepId: Id;
	readonly eventId: Id;
	readonly originId: Id;
	readonly entityId: Id;
	readonly path: Path;
	readonly before: QueryCell;
	readonly after: QueryCell;
};

/** An explicit write remains a change even when old/new values are equal. */
export type WriteChange = HistoryEntry & { readonly kind: "write" };

/** Presence is modeled existence, never a renderer visibility toggle. */
export type PresenceChange = {
	readonly kind: "presence";
	readonly frameId: string;
	readonly frameIndex: number;
	readonly stepId: Id;
	readonly eventId: Id;
	readonly originId: Id;
	readonly target: "entity" | "relation";
	readonly targetId: Id;
	readonly before: boolean;
	readonly after: boolean;
};

export type StateChange = WriteChange | PresenceChange;

export type CausalEvidence = {
	readonly status: "explicit" | "unmodeled";
	readonly dependencies: readonly ReadonlySemanticEvent[];
	readonly explanation: string;
};

/**
 * Read-only, pure indexed inspection of a compiler-owned schema-2 trace.
 * No method interprets event order as physical time or inferred causality.
 */
export type TraceInspector = {
	readonly frameCount: number;
	readonly stateAt: (frameIndex: number) => Readonly<StateSnapshot>;
	readonly valueAt: (frameIndex: number, entityId: Id, path?: Path) => QueryCell;
	readonly diff: (from: number, to: number) => readonly StateChange[];
	readonly history: (entityId: Id, path?: Path) => readonly HistoryEntry[];
	readonly eventsFor: (entityId: Id) => readonly ReadonlySemanticEvent[];
	readonly transfersFor: (relationId: Id) => readonly ReadonlySemanticEvent[];
	readonly dependenciesOf: (eventId: Id) => readonly ReadonlySemanticEvent[];
	readonly causalEvidenceOf: (eventId: Id) => CausalEvidence;
	readonly eventById: (eventId: Id) => ReadonlySemanticEvent;
	readonly claimsForEvent: (eventId: Id) => readonly ReadonlyClaim[];
	readonly relationsFor: (entityId: Id) => readonly ReadonlyRelation[];
};

/** Stable source provenance for renderer-independent v2 views. */
export type SourceIds = {
	readonly entityIds?: readonly Id[];
	readonly relationIds?: readonly Id[];
	readonly eventIds?: readonly Id[];
	readonly groupIds?: readonly Id[];
};
export type ViewKind = "graph" | "sequence" | "state-table";
export type ViewItem = {
	readonly id: Id;
	readonly role: "entity" | "relation" | "event" | "group" | "value";
	readonly label: string;
	readonly description: string;
	readonly source: Readonly<SourceIds>;
	readonly fromItemId?: Id;
	readonly toItemId?: Id;
	readonly data?: ReadonlyJsonValue;
};
export type ViewRequest = {
	readonly kind?: ViewKind;
	readonly frameIndex: number;
	readonly selectedEntityIds?: readonly Id[];
	readonly collapsedGroupIds?: readonly Id[];
};
export type ViewDescriptor = {
	readonly kind: ViewKind;
	readonly frameId: string;
	readonly summary: string;
	readonly items: readonly ViewItem[];
	readonly diagnostics?: readonly string[];
};
