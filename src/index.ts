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
