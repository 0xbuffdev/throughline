import type { CompiledTrace, Id } from "./model.js";

export type SequenceActor = {
	readonly itemId: Id;
	readonly entityId: Id;
	readonly label: string;
};

/** Reserve declared endpoint space without projecting any future evidence. */
export function sequenceActors(trace: CompiledTrace): readonly SequenceActor[] {
	const used = new Set<Id>();
	for (const step of trace.artifact.steps)
		for (const event of step.events)
			if (event.type === "message") used.add(event.relationId);
	const endpoints = new Set<Id>();
	for (const relation of trace.artifact.relations) if (used.has(relation.id)) {
		endpoints.add(relation.from);
		endpoints.add(relation.to);
	}
	return trace.artifact.entities.flatMap((entity, index) => endpoints.has(entity.id)
		? [{ itemId: "node_" + index, entityId: entity.id, label: entity.label }] : []);
}

/** Shared by lifelines and transfers, independently of the viewport width. */
export function laneCenter(index: number, count: number): number {
	return (index + 0.5) * 100 / Math.max(1, count);
}
