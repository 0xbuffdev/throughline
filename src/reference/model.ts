import type {
	Cell, JsonValue, Path, SemanticEvent, Step, VisualArtifact,
} from "../v2/model.js";

/**
 * Reproducible teaching evidence, independent of visualization or a domain DSL.
 * Explanation and questions are matched to this exact authored artifact.
 * Correctness is checked separately; editorial prose is not inferred at runtime.
 */
export type ReferenceQuestion = Readonly<{
	id: string;
	question: string;
	expectedAnswer: string;
	/** Exact declared evidence events supporting the expected answer. */
	evidenceEventIds: readonly string[];
}>;

export type ReferenceExample = Readonly<{
	id: string;
	title: string;
	description: string;
	artifact: VisualArtifact;
	/** Static baseline for comprehension comparisons, not a measured outcome. */
	explanation: string;
	questions: readonly ReferenceQuestion[];
	/** Limits of evidence and scope that a reader must not infer away. */
	caveats: readonly string[];
}>;

export const known = (value: JsonValue): Cell => ({ status: "known", value });

/** Explicit writes only: source state changes cannot be invented by a view. */
export function write(
	id: string, entityId: string, value: JsonValue,
	path: Path = [], originId = "author",
): SemanticEvent {
	return { id, originId, type: "write", entityId, path, value: known(value) };
}

export function step(
	id: string, label: string, note: string, events: SemanticEvent[],
	focusEntityIds: string[] = [],
): Step {
	return {
		id, label, note, events,
		...(focusEntityIds.length ? { focusEntityIds } : {}),
	};
}
