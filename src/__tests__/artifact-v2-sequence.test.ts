import { createHash } from "node:crypto";
import { cpus } from "node:os";
import { describe, expect, it } from "vitest";
import {
	ARTIFACT_LIMITS, compileArtifact, inspectTrace, projectView, serializeArtifact,
	type ViewDescriptor, type ViewItem, type VisualArtifact,
} from "../index.js";
import { retryCheckout } from "./v2-sequence-fixture.js";
import { distributedGraph } from "./v2-graph-fixture.js";

const inspect = (artifact: VisualArtifact = retryCheckout()) =>
	inspectTrace(compileArtifact(artifact));
const sequence = (frameIndex: number, artifact: VisualArtifact = retryCheckout()) =>
	projectView(inspect(artifact), { kind: "sequence", frameIndex });
const items = (view: ViewDescriptor, role: ViewItem["role"]) =>
	view.items.filter(item => item.role === role);
const event = (view: ViewDescriptor, id: string) =>
	items(view, "event").find(item => item.source.eventIds?.includes(id))!;
const correlation = (view: ViewDescriptor, messageId: string) =>
	items(view, "value").find(item => item.data &&
		typeof item.data === "object" && !Array.isArray(item.data) &&
		item.data.messageId === messageId)!;

describe("TL-U06 — pure indexed evidence-aware message sequence", () => {
	it("starts empty without leaking future evidence and remains sequence across seeking", () => {
		const query = inspect();
		for (const frameIndex of [0, 1, 2, 4, 6, 9, 0]) {
			const view = projectView(query, { frameIndex });
			expect(view.kind).toBe("sequence");
			expect(view.frameId).toBe(frameIndex === 0
				? "@initial" : retryCheckout().steps[frameIndex - 1].id);
		}
		const initial = projectView(query, { frameIndex: 0 });
		expect(items(initial, "event")).toEqual([]);
		expect(items(initial, "value")).toEqual([]);
		expect(items(initial, "entity")).toEqual([]);
		expect(initial.summary).toContain("0 explicit message phase event(s)");
		expect(initial.summary).toContain("not assumed lost or successful");
		expect(Object.isFrozen(initial.items)).toBe(true);
	});

	it("groups only observed phases by message ID, without inventing an acknowledgement", () => {
		const query = inspect();
		const initial = projectView(query, { kind: "sequence", frameIndex: 1 });
		expect(items(initial, "event").map(row => row.source.eventIds?.[0]))
			.toEqual(["originalSent"]);
		expect(correlation(initial, "order42").source.eventIds).toEqual(["originalSent"]);
		expect(correlation(initial, "order42").data).toMatchObject({
			type: "message-correlation", messageId: "order42", relationId: "request",
			phases: { sent: 1, received: 0, acknowledged: 0, processed: 0 },
			unmodeledPhases: ["received", "acknowledged", "processed"],
		});
		expect(correlation(initial, "order42").description).toContain("not proof of loss");
		const received = projectView(query, { kind: "sequence", frameIndex: 2 });
		expect(items(received, "event").map(row => row.source.eventIds?.[0]))
			.toEqual(["originalSent", "originalReceived", "originalProcessed"]);
		expect(correlation(received, "order42").source.eventIds)
			.toEqual(["originalSent", "originalReceived", "originalProcessed"]);
		expect(correlation(received, "order42").data).toMatchObject({
			phases: { sent: 1, received: 1, acknowledged: 0, processed: 1 },
			unmodeledPhases: ["acknowledged"],
		});
		expect(event(received, "originalReceived")).toMatchObject({
			role: "event",
			fromItemId: "node_0", toItemId: "node_1",
			source: {
				entityIds: ["client", "gateway"],
				relationIds: ["request"], eventIds: ["originalReceived"],
			},
			data: {
				type: "message", phase: "received", messageId: "order42",
				frameIndex: 2, frameId: "seeOriginal", current: true,
				originId: "observer", originKind: "observed",
				missingPriorSent: false,
			},
		});
		expect(event(received, "originalProcessed").description)
			.toContain("Declared origin compute (computed)");
		expect(event(received, "originalProcessed").description)
			.toContain("no phase or causal link is inferred");
		expect(query.valueAt(2, "gateway")).toEqual({
			status: "unknown", reason: "no state measurement",
		});
		expect(query.valueAt(2, "client", ["ack"]))
			.toEqual({ status: "known", value: false });
		expect(correlation(received, "order42").description).not.toContain("lost acknowledgement");
	});

	it("renders explicit timeout observation/write as contextual evidence, never a fifth phase", () => {
		const query = inspect();
		const third = projectView(query, { kind: "sequence", frameIndex: 3 });
		const observed = event(third, "watchTimeout");
		expect(observed.data).toMatchObject({
			type: "observation", frameIndex: 3, frameId: "timeoutObservation",
			originId: "observer", originKind: "observed",
		});
		expect(observed.source).toEqual({
			eventIds: ["watchTimeout"], entityIds: ["client"],
		});
		expect(observed.description).toContain("non-message evidence is not a message phase");
		expect(query.valueAt(3, "client", ["timeout"]))
			.toEqual({ status: "known", value: false });
		const fourth = projectView(query, { kind: "sequence", frameIndex: 4 });
		const timeout = event(fourth, "timeoutWrite");
		expect(timeout.data).toMatchObject({
			type: "write", current: true, frameIndex: 4, frameId: "timeoutCommit",
		});
		expect(timeout.fromItemId).toBeUndefined();
		expect(timeout.toItemId).toBeUndefined();
		expect(query.valueAt(4, "client", ["timeout"]))
			.toEqual({ status: "known", value: true });
		expect(correlation(fourth, "order42").data).toMatchObject({
			phases: { sent: 1, received: 1, acknowledged: 0, processed: 1 },
		});
		expect(items(fourth, "event")).toHaveLength(5);
		expect(items(fourth, "event").filter(row =>
			row.data && typeof row.data === "object" &&
			!Array.isArray(row.data) && row.data.type === "message")).toHaveLength(3);
	});

	it("keeps distinct retry IDs, duplicate receipt evidence, isolated acknowledgements and source IDs", () => {
		const query = inspect();
		const sentRetry = projectView(query, { kind: "sequence", frameIndex: 5 });
		expect(items(sentRetry, "value").map(row => row.label))
			.toEqual(["Message order42", "Message order42retry"]);
		expect(correlation(sentRetry, "order42").data).toMatchObject({
			phases: { sent: 1, received: 1, acknowledged: 0, processed: 1 },
		});
		expect(correlation(sentRetry, "order42retry").data).toMatchObject({
			phases: { sent: 1, received: 0, acknowledged: 0, processed: 0 },
		});
		expect(query.dependenciesOf("retrySent").map(row => row.id)).toEqual(["timeoutWrite"]);
		expect(event(sentRetry, "retrySent").data).toMatchObject({
			frameIndex: 5, frameId: "retry", phase: "sent",
		});
		const ackRetry = projectView(query, { kind: "sequence", frameIndex: 7 });
		expect(correlation(ackRetry, "order42retry").data).toMatchObject({
			phases: { sent: 1, received: 1, acknowledged: 1, processed: 0 },
		});
		expect(correlation(ackRetry, "order42").data).toMatchObject({
			phases: { sent: 1, received: 1, acknowledged: 0, processed: 1 },
		});
		expect(event(ackRetry, "retryAck").description).not.toContain("state persistence is proven");
		expect(query.valueAt(7, "client", ["ack"]))
			.toEqual({ status: "known", value: true }); // authored separate write only

		const imported = projectView(query, { kind: "sequence", frameIndex: 8 });
		expect(correlation(imported, "orphan").source.eventIds).toEqual(["isolatedAck"]);
		expect(correlation(imported, "orphan").data).toMatchObject({
			phases: { sent: 0, received: 0, acknowledged: 1, processed: 0 },
		});
		expect(event(imported, "isolatedAck").data).toMatchObject({
			phase: "acknowledged", missingPriorSent: true, frameIndex: 8,
		});
		expect(event(imported, "isolatedAck").description)
			.toContain("not proof no send occurred");
		const duplicate = projectView(query, { kind: "sequence", frameIndex: 9 });
		expect(correlation(duplicate, "order42").data).toMatchObject({
			phases: { sent: 1, received: 2, acknowledged: 0, processed: 1 },
		});
		expect(correlation(duplicate, "order42").source.eventIds)
			.toEqual(["originalSent", "originalReceived", "originalProcessed", "repeatReceived"]);
		expect(items(duplicate, "event").map(row => row.source.eventIds?.[0]))
			.toEqual([
				"originalSent", "originalReceived", "originalProcessed", "watchTimeout",
				"timeoutWrite", "retrySent", "retryReceived", "retryAck",
				"ackWrite", "isolatedAck", "repeatReceived",
			]);
		expect(items(duplicate, "event").filter(row => row.source.eventIds?.includes("repeatReceived")))
			.toHaveLength(1);
		expect(duplicate.summary).toContain("ordered by authored steps/events".replace(
			"ordered by authored steps/events", "Ordered by authored steps/events"));
	});

	it("preserves selected source entity across graph, sequence and state-table views", () => {
		const query = inspect();
		for (const frameIndex of [2, 6, 4]) {
			const choices = ["graph", "sequence", "state-table"] as const;
			for (const kind of choices) {
				const projected = projectView(query, {
					kind, frameIndex, selectedEntityIds: ["gateway"],
				});
				expect(projected.frameId).toBe(retryCheckout().steps[frameIndex - 1].id);
				expect(projected.items.some(item =>
					item.source.entityIds?.includes("gateway"))).toBe(true);
				if (kind === "sequence") {
					const actor = items(projected, "entity").find(item =>
						item.source.entityIds?.includes("gateway"))!;
					expect(actor.data).toMatchObject({ selected: true });
					expect(actor.id).toBe("node_1");
				}
			}
		}
	});

	it("follows deterministic hint priority and sequence > graph > state-table ties", () => {
		const artifact = retryCheckout();
		const query = inspect(artifact);
		expect(projectView(query, { frameIndex: 0 }).kind).toBe("sequence");
		artifact.views = [
			{ kind: "graph", priority: 1 }, { kind: "sequence", priority: 1 },
			{ kind: "state-table", priority: 1 },
		];
		const hinted = inspect(artifact);
		expect(projectView(hinted, { frameIndex: 0 }).kind).toBe("sequence");
		expect(projectView(hinted, { frameIndex: 9 }).kind).toBe("sequence");
		artifact.views = [{ kind: "state-table", priority: 0 }, { kind: "sequence", priority: 1 }];
		expect(projectView(inspect(artifact), { frameIndex: 9 }).kind).toBe("state-table");
		artifact.views = [{ kind: "graph", priority: 0 }, { kind: "sequence", priority: 1 }];
		expect(projectView(inspect(artifact), { frameIndex: 9 }).kind).toBe("graph");
		artifact.views = [{ kind: "sequence", priority: 0 }, { kind: "graph", priority: 1 }];
		const noMessages = distributedGraph();
		noMessages.steps = [];
		noMessages.claims = [];
		noMessages.views = artifact.views;
		const noMsgQuery = inspect(noMessages);
		// An incompatible hint is skipped when auto-selecting, but an
		// explicit incompatible request falls back with a diagnostic.
		expect(projectView(noMsgQuery, { frameIndex: 0 }).kind).toBe("graph");
		const rejected = projectView(noMsgQuery, { kind: "sequence", frameIndex: 0 });
		expect(rejected.kind).toBe("state-table");
		expect(rejected.diagnostics).toHaveLength(1);
		expect(rejected.diagnostics?.[0]).toContain("requires an explicit message event");
		expect(rejected.items.some(item => item.role === "event")).toBe(false);
	});

	it("keeps immutable and detached event/phase provenance across random access", () => {
		const input = retryCheckout();
		const query = inspect(input);
		const a = projectView(query, { kind: "sequence", frameIndex: 9 });
		const b = projectView(query, { kind: "sequence", frameIndex: 9 });
		expect(a).toEqual(b);
		expect(Object.isFrozen(a)).toBe(true);
		expect(Object.isFrozen(a.items)).toBe(true);
		expect(Object.isFrozen(correlation(a, "order42").source.eventIds)).toBe(true);
		expect(Object.isFrozen(correlation(a, "order42").data)).toBe(true);
		expect(Object.isFrozen((correlation(a, "order42").data as {
			phases: object
		}).phases)).toBe(true);
		input.steps.length = 0;
		input.entities[0].label = "Changed after compilation";
		expect(projectView(query, { kind: "sequence", frameIndex: 9 })).toEqual(a);
		for (const frameIndex of [1, 8, 3, 9, 0, 2, 5, 9])
			expect(projectView(query, { kind: "sequence", frameIndex }).frameId)
				.toBe(frameIndex === 0 ? "@initial" : retryCheckout().steps[frameIndex - 1].id);
		expect(() => (a.items as ViewItem[]).push({} as never)).toThrow(TypeError);
		expect(() => (correlation(a, "order42").source.eventIds as string[])
			.push("invented")).toThrow(TypeError);
	});

	it("bounds projection on the accepted event ceiling without invented rows", () => {
		const steps = ARTIFACT_LIMITS.steps;
		const each = ARTIFACT_LIMITS.events / steps;
		const source: VisualArtifact = {
			schemaVersion: 2,
			id: "largeSequence",
			origins: [{ id: "author", kind: "authored" }],
			entities: [{ id: "client", label: "Client" }, { id: "server", label: "Server" }],
			relations: [{ id: "link", from: "client", to: "server" }],
			initialState: {
				client: { status: "known", value: 0 },
				server: { status: "unknown" },
			},
			steps: Array.from({ length: steps }, (_, i) => ({
				id: "s" + i, label: "Step " + i,
				events: Array.from({ length: each }, (_, j) => ({
					id: "e" + i + "_" + j,
					originId: "author",
					type: "message" as const,
					relationId: "link", messageId: "batch",
					phase: "sent" as const,
				})),
			})),
		};
		const sha256 = createHash("sha256").update(serializeArtifact(source)).digest("hex");
		const query = inspect(source);
		const started = performance.now();
		const view = projectView(query, { frameIndex: steps });
		const indexedMs = Number((performance.now() - started).toFixed(1));
		const rows = items(view, "event");
		expect(view.kind).toBe("sequence");
		expect(rows).toHaveLength(ARTIFACT_LIMITS.events);
		expect(items(view, "value")).toHaveLength(1);
		expect(items(view, "entity")).toHaveLength(2);
		expect(correlation(view, "batch").source.eventIds).toHaveLength(10_000);
		expect(correlation(view, "batch").data).toMatchObject({
			phases: { sent: 10_000, received: 0, acknowledged: 0, processed: 0 },
		});
		expect(rows[0].source.eventIds).toEqual(["e0_0"]);
		expect(rows.at(-1)?.source.eventIds).toEqual(["e1999_4"]);
		expect(projectView(query, { frameIndex: 0 }).items).toEqual([]);
		console.info("TL-U06 sequence projection boundary:", JSON.stringify({
			fixtureSHA256: sha256,
			steps, events: ARTIFACT_LIMITS.events,
			node: process.version, platform: process.platform, cpu: cpus()[0]?.model,
			projectTenThousandRowsMs: indexedMs,
		}));
	}, 60_000);
});
