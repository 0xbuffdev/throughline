import type { VisualArtifact } from "../v2/model.js";

/** Reviewed TL-U07 resource ceiling: 1,000 editorial claims, 100 cited events
 * each, all referencing the same focused authored fact. No implied causality
 * or persistent state results from these observation-family events. */
export function claimHeavyInspection(): VisualArtifact {
	const evidenceEventIds = Array.from({ length: 100 }, (_, i) => "observation" + i);
	return {
		schemaVersion: 2,
		id: "claimHeavyInspection",
		title: "Claim-dense explicit observation history",
		origins: [{ id: "author", kind: "authored" }],
		entities: [{ id: "subject", label: "Subject" }],
		relations: [],
		initialState: { subject: { status: "unknown", reason: "no state write" } },
		steps: Array.from({ length: 100 }, (_, i) => ({
			id: "step" + i,
			label: "Explicit observation " + i,
			events: [{
				id: "observation" + i,
				originId: "author",
				type: "observation" as const,
				entityId: "subject",
				value: { status: "known" as const, value: "recorded " + i },
			}],
		})),
		claims: Array.from({ length: 1000 }, (_, i) => ({
			id: "claim" + i,
			text: "Editorial interpretation " + i,
			originId: "author",
			kind: "explanation" as const,
			review: "unreviewed" as const,
			evidenceEventIds: [...evidenceEventIds],
		})),
	};
}
