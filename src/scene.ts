import type { Snapshot } from "./model.js";

/** Hidden endpoints suppress their links without destroying either identity. */
export function visibleScene(
	state: Snapshot,
): Pick<Snapshot, "entities" | "relations"> {
	const entities = state.entities.filter((entity) => !entity.hidden);
	const ids = new Set(entities.map((entity) => entity.id));
	const relations = state.relations.filter(
		(relation) =>
			!relation.hidden && ids.has(relation.from) && ids.has(relation.to),
	);
	return { entities, relations };
}
