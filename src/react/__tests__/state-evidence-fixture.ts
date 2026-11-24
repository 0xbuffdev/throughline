import type { VisualArtifact } from "../../v2/model.js";

/** Same message relation, two distinct correlations, separate phase events,
 * and a later write-only frame. No inferred receipt or persistence. */
export function stateEvidenceFixture(): VisualArtifact {
	return {
		schemaVersion: 2, id: "stateEvidence",
		origins: [{ id: "author", kind: "authored" }],
		entities: [{ id: "client", label: "Client" }, { id: "server", label: "Server" }],
		relations: [{ id: "request", from: "client", to: "server" }],
		initialState: { server: { status: "known", value: 0 } },
		steps: [
			{ id: "send", label: "Two messages", events: [
				{ id: "firstSent", originId: "author", type: "message",
					relationId: "request", messageId: "messageOne", phase: "sent" },
				{ id: "secondSent", originId: "author", type: "message",
					relationId: "request", messageId: "messageTwo", phase: "sent" },
			] },
			{ id: "receipt", label: "First receipt", events: [
				{ id: "firstReceived", originId: "author", type: "message",
					relationId: "request", messageId: "messageOne", phase: "received" },
			] },
			{ id: "commit", label: "Explicit write", events: [
				{ id: "commitValue", originId: "author", type: "write",
					entityId: "server", path: [], value: { status: "known", value: 1 } },
			] },
		],
	};
}
