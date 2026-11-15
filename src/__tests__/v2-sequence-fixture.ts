import type { VisualArtifact } from "../v2/model.js";

/**
 * Loss of an acknowledgement is a scenario question, NOT a proven event.
 * The model has an original send/receipt/processing, an explicit authored
 * timeout state transition and a separately identified retry + ack.
 * It deliberately never claims the original acknowledgement was lost.
 */
export function retryCheckout(): VisualArtifact {
	return {
		schemaVersion: 2,
		id: "retryCheckout",
		title: "Checkout with missing acknowledgement evidence and retry",
		origins: [
			{ id: "author", kind: "authored" },
			{ id: "observer", kind: "observed" },
			{ id: "compute", kind: "computed" },
		],
		entities: [
			{ id: "client", label: "Client" },
			{ id: "gateway", label: "Gateway" },
			{ id: "ledger", label: "Ledger" },
		],
		relations: [
			{ id: "request", from: "client", to: "gateway", label: "Checkout request" },
			{ id: "write", from: "gateway", to: "ledger", label: "Ledger update" },
		],
		initialState: {
			client: { status: "known", value: { timeout: false, ack: false } },
			gateway: { status: "unknown", reason: "no state measurement" },
			ledger: { status: "known", value: { committed: false } },
		},
		steps: [
			{ id: "sendOriginal", label: "Send initial request", events: [
				{ id: "originalSent", originId: "author", type: "message",
					relationId: "request", messageId: "order42", phase: "sent" },
			] },
			{ id: "seeOriginal", label: "Record received/processed evidence", events: [
				{ id: "originalReceived", originId: "observer", type: "message",
					relationId: "request", messageId: "order42", phase: "received" },
				{ id: "originalProcessed", originId: "compute", type: "message",
					relationId: "request", messageId: "order42", phase: "processed" },
			] },
			{ id: "timeoutObservation", label: "Observe missing acknowledgement evidence",
				events: [
					{ id: "watchTimeout", originId: "observer", type: "observation",
						entityId: "client",
						value: { status: "known", value: "no acknowledgement recorded yet" } },
				] },
			{ id: "timeoutCommit", label: "Explicitly model timeout state", events: [
				{ id: "timeoutWrite", originId: "author", type: "write",
					entityId: "client", path: ["timeout"],
					value: { status: "known", value: true } },
			] },
			{ id: "retry", label: "Send distinct retry ID", events: [
				{ id: "retrySent", originId: "author", type: "message",
					relationId: "request", messageId: "order42retry", phase: "sent",
					dependsOn: ["timeoutWrite"] },
			] },
			{ id: "receiveRetry", label: "Observe retry receipt", events: [
				{ id: "retryReceived", originId: "observer", type: "message",
					relationId: "request", messageId: "order42retry", phase: "received" },
			] },
			{ id: "ackRetry", label: "Observe retry acknowledgement", events: [
				{ id: "retryAck", originId: "observer", type: "message",
					relationId: "request", messageId: "order42retry", phase: "acknowledged" },
				{ id: "ackWrite", originId: "author", type: "write",
					entityId: "client", path: ["ack"],
					value: { status: "known", value: true } },
			] },
			{ id: "orphanAck", label: "Imported isolated acknowledgement", events: [
				{ id: "isolatedAck", originId: "observer", type: "message",
					relationId: "request", messageId: "orphan", phase: "acknowledged" },
			] },
			{ id: "repeatedReceipt", label: "Second receipt report on original ID", events: [
				{ id: "repeatReceived", originId: "observer", type: "message",
					relationId: "request", messageId: "order42", phase: "received" },
			] },
		],
	};
}
