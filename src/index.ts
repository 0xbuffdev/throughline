/** Pure authoring and compilation API. The optional renderer lives at ./react. */
export { parseProgram } from "./authoring.js";
export { compileProgram, validateProgram } from "./compiler.js";
export { describeFrame } from "./describe.js";
export { compile, compileAst, SUPPORTED_DOMAINS } from "./domains/registry.js";
export type { DomainName } from "./domains/types.js";
export { parseThl, type ThlBlock } from "./dsl.js";
export { COMPILATION_LIMITS } from "./limits.js";
export type {
	Beat,
	Diagnostic,
	Entity,
	Event,
	Frame,
	GroupLayout,
	Program,
	Relation,
	SceneGroup,
	Snapshot,
	SourceLocation,
	Trace,
	Value,
	View,
} from "./model.js";
export { ProgramError } from "./model.js";
export { type StepApi, type Tracer, tracer } from "./tracer.js";

/**
 * Schema-2 semantic artifact boundary (TL-U02). The v1 compiler/player
 * migration is deliberately separate work in TL-U03–TL-U10.
 */
export {
	ARTIFACT_LIMITS,
	ARTIFACT_SCHEMA_VERSION,
} from "./v2/model.js";
export type {
	CausalEvidence,
	Cell,
	Claim,
	CompiledFrame,
	CompiledTrace,
	HistoryEntry,
	StateSnapshot,
	StateChange,
	PresenceChange,
	TraceInspector,
	WriteChange,
	Entity as V2Entity,
	EventBase,
	Group,
	Id,
	JsonValue,
	Origin,
	OriginKind,
	Path,
	QueryCell,
	Relation as V2Relation,
	SemanticEvent,
	Step,
	ViewHint,
	VisualArtifact,
} from "./v2/model.js";
export {
	ArtifactValidationError,
	parseArtifactJson,
	serializeArtifact,
	validateArtifact,
} from "./v2/validator.js";

/** Pure schema-2 atomic replay; no legacy domain compatibility layer. */
export { compileArtifact, ArtifactCompilationError } from "./v2/compiler.js";

/** Pure indexed schema-2 queries with no React, network or legacy adapter. */
export { inspectTrace, TraceQueryError } from "./v2/inspector.js";
