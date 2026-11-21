import type { VisualArtifact } from "../../../v2/model.js";

/** Synthetic deterministic fixtures, not claims about real network behavior. */
export function graphWorkload(entities: number, relations: number): VisualArtifact {
	return { schemaVersion: 2, id: "mermaidScale", origins: [{ id: "synthetic", kind: "simulated" }],
		entities: Array.from({ length: entities }, (_, index) => ({ id: "entity" + index, label: "Service " + index })),
		relations: Array.from({ length: relations }, (_, index) => ({ id: "relation" + index,
			from: "entity" + index % entities, to: "entity" + ((index % entities + 1) % entities) })),
		initialState: Object.fromEntries(Array.from({ length: entities }, (_, index) =>
			["entity" + index, { status: "known", value: index }])), steps: [] };
}

export function sequenceWorkload(): VisualArtifact {
	const artifact = graphWorkload(3, 2);
	artifact.steps = Array.from({ length: 100 }, (_, step) => ({ id: "step" + step, label: "Atomic batch " + step,
		events: Array.from({ length: 100 }, (_, event) => ({ id: "event" + (step * 100 + event),
			type: "message", originId: "synthetic", relationId: "relation" + (Math.floor(event / 2) % 2),
			messageId: "message" + Math.floor((step * 100 + event) / 2),
			phase: event % 2 === 0 ? "sent" : "received" })) }));
	return artifact;
}
