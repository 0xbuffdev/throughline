import type { Trace } from "../model.js";
import { parseTarget } from "../path.js";

/**
 * Cumulative authored activity through the selected frame, without inferring
 * acknowledgements or changing any compiled state. A show-link event records
 * structural revelation, not an actual message delivery.
 */
export type TraceProgress = {
	readonly participatingNodes: ReadonlySet<string>;
	readonly traversedRelations: ReadonlySet<string>;
	readonly revealedRelations: ReadonlySet<string>;
};

export function traceProgress(trace: Trace, step: number): TraceProgress {
	const participatingNodes = new Set<string>();
	const traversedRelations = new Set<string>();
	const revealedRelations = new Set<string>();
	const relations = new Map(
		(trace.frames[0]?.state.relations ?? []).map((relation) => [relation.id, relation]),
	);
	const last = Math.min(Math.max(0, Math.trunc(step)), trace.frames.length - 1);
	for (let index = 0; index <= last; index++) {
		const frame = trace.frames[index];
		for (const target of frame.state.active) {
			const parsed = parseTarget(target);
			if (parsed) participatingNodes.add(parsed.id);
		}
		for (const transfer of frame.state.transfers) {
			traversedRelations.add(transfer.relation);
			const relation = relations.get(transfer.relation);
			if (relation) {
				// The destination participated as an endpoint; this does not
				// imply it processed or persisted any payload.
				participatingNodes.add(relation.from);
				participatingNodes.add(relation.to);
			}
		}
		for (const event of frame.events) {
			if (event.op === "show" && event.kind === "link")
				revealedRelations.add(event.id);
		}
	}
	return { participatingNodes, traversedRelations, revealedRelations };
}
