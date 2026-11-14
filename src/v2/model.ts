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
