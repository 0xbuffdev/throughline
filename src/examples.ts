import { binaryReference } from "./reference/binary.js";
import { checkoutReference } from "./reference/checkout.js";
import { factorialReference } from "./reference/factorial.js";
import { matrixReference } from "./reference/matrix.js";

export type { ReferenceExample, ReferenceQuestion } from "./reference/model.js";

/**
 * The public examples catalog is schema 2 only. There are no domain-specific
 * fence strings or trace-version adapters. Each example exposes one typed
 * artifact and a matched static text/questions baseline.
 */
export const EXAMPLES = Object.freeze([
	factorialReference,
	matrixReference,
	binaryReference,
	checkoutReference,
]);

/** Explicit alias for consumers who prefer the descriptive reference name. */
export const REFERENCE_EXAMPLES = EXAMPLES;
