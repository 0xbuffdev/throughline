import type { VisualArtifact } from "../v2/model.js";

/**
 * Shared truth fixture for pure, React/browser and SSR acceptance tests.
 * A received/processed fact is deliberately NOT a send or persistence.
 */
export function distributedGraph(): VisualArtifact {
	return {
		schemaVersion: 2,
		id: "distributedCheckout",
		title: "Distributed checkout",
		origins: [
			{ id: "author", kind: "authored" },
			{ id: "witness", kind: "observed" },
		],
		groups: [
			{ id: "system", label: "Checkout" },
			{ id: "front", label: "Frontend", parentId: "system" },
			{ id: "back", label: "Backend", parentId: "system" },
		],
		entities: [
			{ id: "client", label: "Client", groupId: "front" },
			{ id: "gateway", label: "Gateway", groupId: "front" },
			{ id: "ledger", label: "Ledger", groupId: "back" },
			{ id: "worker", label: "Worker", groupId: "back", initiallyPresent: false },
		],
		relations: [
			{ id: "request", from: "client", to: "gateway", label: "Request" },
			{ id: "settlement", from: "gateway", to: "ledger", label: "Settlement" },
			{ id: "task", from: "ledger", to: "worker", label: "Task",
				initiallyPresent: false },
		],
		initialState: {
			client: { status: "known", value: { paid: false, amount: 25 } },
			gateway: { status: "unknown", reason: "not measured" },
			ledger: { status: "known", value: { settled: false, amount: null } },
			worker: { status: "known", value: { task: "queued" } },
		},
		steps: [
			{ id: "dispatch", label: "Send request", note: "A send does not imply receipt.",
				focusEntityIds: ["client"],
				events: [{ id: "sent", type: "message", originId: "author",
					relationId: "request", messageId: "charge", phase: "sent" }] },
			{ id: "observed", label: "Witness sees request",
				events: [
					{ id: "received", type: "message", originId: "witness",
						relationId: "request", messageId: "charge", phase: "received",
						dependsOn: ["sent"] },
					{ id: "evidence", type: "observation", originId: "witness",
						entityId: "gateway",
						value: { status: "known", value: "maybe arrived" } },
				] },
			{ id: "commit", label: "Explicit ledger write",
				events: [
					{ id: "settled", type: "write", originId: "author",
						entityId: "ledger", path: ["settled"],
						value: { status: "known", value: true } },
					{ id: "processed", type: "message", originId: "witness",
						relationId: "settlement", messageId: "other", phase: "processed" },
				] },
			{ id: "activate", label: "Activate worker",
				events: [
					{ id: "workerOn", type: "topology", originId: "author",
						target: "entity", targetId: "worker", present: true },
					{ id: "taskOn", type: "topology", originId: "author",
						target: "relation", targetId: "task", present: true },
				] },
			{ id: "workerSend", label: "Send to worker",
				events: [
					{ id: "sentTask", type: "message", originId: "author",
						relationId: "task", messageId: "job", phase: "sent" },
					{ id: "ack", type: "message", originId: "witness",
						relationId: "request", messageId: "charge",
						phase: "acknowledged" },
				] },
			{ id: "removeWorker", label: "Deactivate worker",
				events: [
					{ id: "taskOff", type: "topology", originId: "author",
						target: "relation", targetId: "task", present: false },
					{ id: "workerOff", type: "topology", originId: "author",
						target: "entity", targetId: "worker", present: false },
				] },
		],
		claims: [
			{ id: "unreviewed", text: "Processing caused settlement",
				kind: "causal", originId: "author",
				evidenceEventIds: ["processed"], review: "unreviewed" },
		],
	};
}
