import { serializeArtifact, validateArtifact } from "./v2/validator.js";
import { binaryReference } from "./reference/binary.js";
import { checkoutReference } from "./reference/checkout.js";
import { factorialReference } from "./reference/factorial.js";
import { matrixReference } from "./reference/matrix.js";
import type { VisualArtifact } from "./v2/model.js";
import type { ReferenceExample } from "./reference/model.js";

export type { ReferenceExample, ReferenceQuestion } from "./reference/model.js";

/**
 * A reference has one immutable, prevalidated canonical source of truth.
 * Catalog metadata and question evidence are frozen; the artifact accessor
 * returns a detached, mutable JSON copy on EVERY read. Consumers can safely
 * edit their working example without changing the public matched baseline.
 *
 * JSON.parse is safe here because the stored string comes only from the strict
 * schema-2 validator and canonical serializer, never directly from a caller.
 */
function publishedReference(reference: ReferenceExample): ReferenceExample {
	const canonical = serializeArtifact(validateArtifact(reference.artifact));
	const questions = Object.freeze(reference.questions.map(question => Object.freeze({
		...question,
		evidenceEventIds: Object.freeze([...question.evidenceEventIds]),
	})));
	return Object.freeze({
		id: reference.id,
		title: reference.title,
		description: reference.description,
		get artifact(): VisualArtifact {
			return JSON.parse(canonical) as VisualArtifact;
		},
		explanation: reference.explanation,
		questions,
		caveats: Object.freeze([...reference.caveats]),
	});
}

/**
 * One schema-2 example catalog, with no domain-tagged syntax or v1 adapter.
 * Every read of example.artifact yields a fresh editable model; authors must
 * compile that copy through the same strict validator as any other input.
 */
export const EXAMPLES: readonly ReferenceExample[] = Object.freeze([
	publishedReference(factorialReference),
	publishedReference(matrixReference),
	publishedReference(binaryReference),
	publishedReference(checkoutReference),
]);

/** Explicit alias for consumers who prefer the descriptive reference name. */
export const REFERENCE_EXAMPLES = EXAMPLES;
