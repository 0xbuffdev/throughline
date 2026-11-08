import { parseProgram } from "../authoring.js";
import { compileProgram } from "../compiler.js";
import { parseThl, type ThlBlock } from "../dsl.js";
import { COMPILATION_LIMITS, createBudget } from "../limits.js";
import { type Program, ProgramError, type Trace } from "../model.js";
import { buildBinary, parseBinary } from "./binary.js";
import { buildBindings, parseBindings } from "./bindings.js";
import { buildCallstack, parseCallstack } from "./callstack.js";
import { buildMatrix, parseMatrix } from "./matrix.js";
import type { DomainName } from "./types.js";

export const SUPPORTED_DOMAINS: readonly DomainName[] = [
	"flow",
	"bindings",
	"binary",
	"matrix",
	"callstack",
];

const COMPUTED: Record<
	Exclude<DomainName, "flow">,
	(ast: ThlBlock) => Program
> = {
	bindings: (ast) => buildBindings(checkParameters(parseBindings(ast))),
	binary: (ast) => buildBinary(checkParameters(parseBinary(ast))),
	matrix: (ast) => buildMatrix(checkParameters(parseMatrix(ast))),
	callstack: (ast) => buildCallstack(checkParameters(parseCallstack(ast))),
};

/** Adapters may serialize labels before producing a Program. Guard their input first. */
function checkParameters<T>(parameters: T): T {
	createBudget("Program input", COMPILATION_LIMITS.programUnits)(parameters);
	return parameters;
}

/** Compile any fenced thl block, routing on the info-string domain. */
export function compile(src: string): Trace {
	const ast = parseThl(src);
	if (!ast)
		throw new ProgramError([{ message: "Expected a ```thl <domain> block." }]);
	return compileAst(ast);
}

export function compileAst(ast: ThlBlock): Trace {
	if (ast.kind === "flow") return compileProgram(parseProgram(ast));
	const build = Object.hasOwn(COMPUTED, ast.kind)
		? COMPUTED[ast.kind as Exclude<DomainName, "flow">]
		: undefined;
	if (!build)
		throw new ProgramError([
			{
				message: `Unknown domain "${ast.kind}". Use ${SUPPORTED_DOMAINS.join(", ")}.`,
				line: ast.source?.line ?? 1,
			},
		]);
	return compileProgram(build(ast));
}
