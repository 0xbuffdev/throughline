/** Pure schema-2 Throughline core. No legacy domain compiler or React imports. */
/**
 * Schema-2 semantic artifact boundary (TL-U02). The previous domain-tagged parser is not a public API.
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
	Entity,
	Entity as V2Entity,
	EventBase,
	Group,
	Id,
	JsonValue,
	Origin,
	OriginKind,
	Path,
	QueryCell,
	Relation,
	Relation as V2Relation,
	SemanticEvent,
	Step,
	ViewHint,
	VisualArtifact,
	SourceIds,
	ViewDescriptor,
	ViewItem,
	ViewKind,
	ViewRequest,
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

/** Renderer-independent, source-linked v2 graph/placeholder projection. */
export { projectView } from "./v2/views.js";

/** Pure renderer-independent Explain/Inspect projection; trusted v2 indexes only. */
export { projectInspection } from "./v2/inspection.js";
export type {
	InspectionChapter, InspectionClaim, InspectionEvidence, InspectionFocus,
	InspectionRecorded,
	InspectionRelation, InspectionRequest, InspectionSelection, InspectionStateRow,
	InspectionView,
} from "./v2/inspection.js";

/** Single unqualified thl authoring surface: strict JSON or reviewed prose. */
export {
	ThroughlineAuthoringError, normalizeThlBody, parseIntentBlock, parseThlBody,
	artifactRelativePath, validateSidecarManifest, resolveThlBody, artifactSha256,
} from "./v2/authoring.js";
export type {
	IntentBlock, ThlBody, SidecarEntry, SidecarManifest, MaterializationOptions,
	AuthoringErrorCode,
} from "./v2/authoring.js";
export { sha256Text } from "./v2/sha256.js";
