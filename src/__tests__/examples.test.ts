import { describe, expect, it } from "vitest";
import {
	artifactSha256, compileArtifact, inspectTrace, parseArtifactJson, projectView,
	resolveThlBody, serializeArtifact, sha256Text, validateArtifact,
	type Cell, type CompiledTrace, type SemanticEvent, type ViewDescriptor,
	type VisualArtifact,
} from "../index.js";
import { EXAMPLES } from "../examples.js";

const reference = (id: string) => {
	const example = EXAMPLES.find(item => item.id === id);
	if (!example) throw new Error("Missing schema-2 example " + id);
	return { example, trace: compileArtifact(example.artifact) };
};
const frameIndex = (trace: CompiledTrace, id: string) => {
	const result = trace.frames.find(frame => frame.id === id);
	if (!result) throw new Error("Missing frame " + id);
	return result.index;
};
const allEvents = (artifact: VisualArtifact) =>
	artifact.steps.flatMap(step => step.events);
const byId = (artifact: VisualArtifact, id: string): SemanticEvent => {
	const found = allEvents(artifact).find(event => event.id === id);
	if (!found) throw new Error("Missing event " + id);
	return found;
};
const knownAt = (trace: CompiledTrace, stepId: string, entityId: string) => {
	const cell = inspectTrace(trace).valueAt(frameIndex(trace, stepId), entityId);
	if (cell.status !== "known") throw new Error("Expected known " + entityId);
	return cell.value;
};


function atStep(trace: CompiledTrace, stepId: string, kind: "graph" | "sequence" | "state-table"): ViewDescriptor {
	return projectView(inspectTrace(trace), { kind, frameIndex: frameIndex(trace, stepId) });
}

/** The same exact compiled cell must be present in graph and state-table. */
function expectProjectedCell(
	view: ViewDescriptor, kind: "graph" | "state-table",
	entityId: string, cell: unknown,
): void {
	expect(view.kind).toBe(kind);
	const role = kind === "graph" ? "entity" : "value";
	const item = view.items.find(item => item.role === role &&
		item.source.entityIds?.includes(entityId));
	expect(item, kind + ": missing " + entityId).toBeDefined();
	expect((item?.data as { cell?: Cell } | undefined)?.cell)
		.toEqual(cell);
}

function expectEvent(view: ViewDescriptor, eventId: string, type: string, phase?: string): void {
	const hits = view.items.filter(item => item.role === "event" &&
		item.source.eventIds?.includes(eventId));
	expect(hits, view.kind + ": " + eventId).toHaveLength(1);
	const data = hits[0].data as { type?: string; phase?: string };
	expect(data.type).toBe(type);
	expect(data.phase).toBe(phase);
}

function correlation(view: ViewDescriptor, messageId: string) {
	expect(view.kind).toBe("sequence");
	const matches = view.items.filter(item => item.role === "value" &&
		(item.data as { messageId?: string } | undefined)?.messageId === messageId);
	expect(matches, "correlation for " + messageId).toHaveLength(1);
	return matches[0]!;
}

function expectPhases(
	view: ViewDescriptor, messageId: string,
	sent: number, received: number, acknowledged: number, processed: number,
	eventIds: readonly string[],
): void {
	const item = correlation(view, messageId);
	expect((item.data as { phases?: unknown }).phases).toEqual({
		sent, received, acknowledged, processed,
	});
	expect(item.source.eventIds).toEqual(eventIds);
}

describe("TL-U09 — first-party schema-2 reference contract", () => {
	it("ships four unique domain-neutral typed artifacts and matched static baselines", () => {
		expect(EXAMPLES.map(example => example.id)).toEqual([
			"factorial", "matrix", "binary", "checkout",
		]);
		for (const { id, artifact, description, explanation, questions, caveats } of EXAMPLES) {
			expect(artifact.schemaVersion).toBe(2);
			expect(artifact.steps.length, id).toBeGreaterThan(2);
			expect(artifact.steps.every(step => step.note && step.note.length > 10)).toBe(true);
			expect(description.length).toBeGreaterThan(15);
			expect(explanation.length).toBeGreaterThan(100);
			expect(questions.length).toBeGreaterThanOrEqual(3);
			expect(caveats.length).toBeGreaterThan(0);
			const eventIds = new Set(allEvents(artifact).map(event => event.id));
			const questionIds = new Set<string>();
			for (const question of questions) {
				expect(questionIds.has(question.id), id).toBe(false);
				questionIds.add(question.id);
				expect(question.expectedAnswer.length).toBeGreaterThan(15);
				expect(question.evidenceEventIds.length).toBeGreaterThan(0);
				for (const eventId of question.evidenceEventIds)
					expect(eventIds.has(eventId), id + ":" + question.id).toBe(true);
			}
			for (const claim of artifact.claims ?? [])
				for (const eventId of claim.evidenceEventIds)
					expect(eventIds.has(eventId), id + ":" + claim.id).toBe(true);
		}
	});


	it("isolates consumer mutations from the canonical artifact, text and question evidence", () => {
		expect(Object.isFrozen(EXAMPLES)).toBe(true);
		for (const example of EXAMPLES) {
			const canonical = example.artifact;
			const digest = artifactSha256(canonical);
			const first = example.artifact;
			const second = example.artifact;
			expect(first).not.toBe(second);
			expect(first.steps[0]).not.toBe(second.steps[0]);
			expect(first.initialState).not.toBe(second.initialState);
			expect(Object.isFrozen(example)).toBe(true);
			expect(Object.isFrozen(example.questions)).toBe(true);
			expect(Object.isFrozen(example.questions[0])).toBe(true);
			expect(Object.isFrozen(example.questions[0].evidenceEventIds)).toBe(true);
			expect(Object.isFrozen(example.caveats)).toBe(true);
			const explanation = example.explanation;
			const question = example.questions[0].expectedAnswer;
			const cited = [...example.questions[0].evidenceEventIds];
			// Consumers should be able to customize their own model without
			// changing later imports, matched explanations or referenced IDs.
			first.steps[0].events[0].id = "consumerOnly";
			first.initialState[Object.keys(first.initialState)[0]] = { status: "known", value: "changed" };
			first.entities[0].label = "edited by a consumer";
			first.steps.push({ id: "consumerAdded", label: "An unreviewed new step", events: [] });
			expect(artifactSha256(example.artifact)).toBe(digest);
			expect(example.artifact).toEqual(canonical);
			expect(compileArtifact(example.artifact).artifact.id).toBe(canonical.id);
			expect(example.explanation).toBe(explanation);
			expect(example.questions[0].expectedAnswer).toBe(question);
			expect(example.questions[0].evidenceEventIds).toEqual(cited);
			expect(() => (example.questions[0].evidenceEventIds as string[]).push("invented")).toThrow();
			expect(() => (example.caveats as string[]).push("invented")).toThrow();
			expect(serializeArtifact(validateArtifact(second)))
				.toBe(serializeArtifact(validateArtifact(canonical)));
		}
	});

	it.each(EXAMPLES)("validates and compiles $title from direct JSON offline with stable hashes", ({ artifact }) => {
		const validated = validateArtifact(artifact);
		const source = serializeArtifact(validated);
		expect(parseArtifactJson(source)).toEqual(validated);
		expect(resolveThlBody(source)).toEqual(validated);
		expect(serializeArtifact(parseArtifactJson(source))).toBe(source);
		expect(artifactSha256(validated)).toBe(sha256Text(source));
		expect(compileArtifact(artifact)).toEqual(compileArtifact(parsedAgain(source)));
		const trace = compileArtifact(artifact);
		expect(Object.isFrozen(trace)).toBe(true);
		expect(trace.frames.map(frame => frame.id)).toEqual([
			"@initial", ...artifact.steps.map(step => step.id),
		]);
	});

	it.each(EXAMPLES)("keeps $title source facts identical across pure graph, state and sequence projection", ({ artifact }) => {
		const trace = compileArtifact(artifact);
		const inspector = inspectTrace(trace);
		const initial = serializeArtifact(trace.artifact);
		const validIds = {
			entityIds: new Set(artifact.entities.map(entity => entity.id)),
			relationIds: new Set(artifact.relations.map(relation => relation.id)),
			eventIds: new Set(allEvents(artifact).map(event => event.id)),
			groupIds: new Set((artifact.groups ?? []).map(group => group.id)),
		};
		for (const index of [0, 1, Math.floor((trace.frames.length - 1) / 2), trace.frames.length - 1]) {
			const before = JSON.stringify(inspector.stateAt(index));
			for (const kind of ["graph", "state-table", "sequence"] as const) {
				const projected = projectView(inspector, { kind, frameIndex: index });
				expect(projected.frameId).toBe(trace.frames[index].id);
				expect(projected.summary.length).toBeGreaterThan(0);
				for (const item of projected.items) {
					let sources = 0;
					for (const type of ["entityIds", "relationIds", "eventIds", "groupIds"] as const)
						for (const id of item.source[type] ?? []) {
							expect(validIds[type].has(id), artifact.id + ": " + id).toBe(true);
							sources++;
						}
					expect(sources, artifact.id + ":" + item.id).toBeGreaterThan(0);
				}
			}
			expect(JSON.stringify(inspector.stateAt(index))).toBe(before);
		}
		expect(serializeArtifact(trace.artifact)).toBe(initial);
		expect(inspector.diff(0, trace.frames.length - 1).map(change => change.eventId))
			.toEqual(allEvents(artifact).filter(event => event.type === "write" || event.type === "topology")
				.map(event => event.id));
	});


	it.each([
		["factorial", "return4", "result", { status: "known", value: 24 }, "factorialResult"],
		["matrix", "cell11", "result", { status: "known", value: [[19, 22], [43, 50]] }, "write11"],
		["binary", "finalCarry", "sum", { status: "known", value: [1, 0, 0, 0, 1] }, "leadingCarry"],
	] as const)("projects %s final modeled results and exact authored evidence in graph, table and history",
		(id, stepId, entityId, expected, eventId) => {
			const { trace } = reference(id);
			const history = inspectTrace(trace).history(entityId);
			expect(history.some(entry => entry.eventId === eventId)).toBe(true);
			for (const kind of ["graph", "state-table"] as const) {
				const view = atStep(trace, stepId, kind);
				expectProjectedCell(view, kind, entityId, expected);
				expectEvent(view, eventId, "write");
				expect(view.items.length).toBeGreaterThan(0);
			}
			const fallback = atStep(trace, stepId, "sequence");
			expect(fallback.kind).toBe("state-table");
			expect(fallback.diagnostics?.join(" ")).toMatch(/requires an explicit message/);
			expectProjectedCell(fallback, "state-table", entityId, expected);
			expectEvent(fallback, eventId, "write");
			expect(fallback.items.some(item => item.role === "event" &&
				(item.data as { type?: string })?.type === "message")).toBe(false);
		});

	it("retains checkout sent, received and processed facts across sequence, graph, table and history", () => {
		const { trace, example } = reference("checkout");
		const inspector = inspectTrace(trace);
		// At first charge send: graph must show exactly one active send,
		// table must carry that event, and sequence may not invent receipt.
		const firstGraph = atStep(trace, "sendCharge", "graph");
		const firstTable = atStep(trace, "sendCharge", "state-table");
		const firstSequence = atStep(trace, "sendCharge", "sequence");
		expectEvent(firstGraph, "chargeFirstSent", "message", "sent");
		expectEvent(firstTable, "chargeFirstSent", "message", "sent");
		expectEvent(firstSequence, "chargeFirstSent", "message", "sent");
		const edge = firstGraph.items.find(item => item.role === "relation" &&
			item.source.relationIds?.includes("charge"));
		expect(edge).toBeDefined();
		expect(edge?.source.eventIds).toEqual(["chargeFirstSent"]);
		expect((edge?.data as { sentCurrent?: number }).sentCurrent).toBe(1);
		expectPhases(firstSequence, "paymentFirst", 1, 0, 0, 0, ["chargeFirstSent"]);
		for (const [stepId, eventId, from, to] of [
			["queuePayment", "enqueueSent", "api", "queue"],
			["queueRetry", "rescheduleSent", "worker", "queue"],
			["sendReply", "resultSent", "provider", "worker"],
			["reportPayment", "paymentReportSent", "worker", "api"],
			["notifyCustomer", "noticeSent", "api", "customer"],
		] as const) {
			const sequence = atStep(trace, stepId, "sequence");
			const event = sequence.items.find(item => item.role === "event" && item.source.eventIds?.includes(eventId));
			expect(event?.data).toMatchObject({ phase: "sent", fromEntityId: from, toEntityId: to });
		}
		for (const kind of ["graph", "state-table"] as const) {
			expectProjectedCell(atStep(trace, "sendCharge", kind), kind,
				"provider", { status: "known", value: { chargedKeys: [], count: 0 } });
			expectProjectedCell(atStep(trace, "sendCharge", kind), kind,
				"outcome", { status: "unknown", reason: "no acknowledged provider result at worker" });
		}

		// The fictional provider records a modeled receipt+processing and
		// separate state write. No worker acknowledgement is synthesized.
		for (const kind of ["graph", "state-table", "sequence"] as const) {
			const view = atStep(trace, "providerCharge", kind);
			expectEvent(view, "chargeFirstReceived", "message", "received");
			expectEvent(view, "chargeFirstProcessed", "message", "processed");
			expectEvent(view, "providerCharged", "write");
		}
		expectPhases(atStep(trace, "providerCharge", "sequence"),
			"paymentFirst", 1, 1, 0, 1,
			["chargeFirstSent", "chargeFirstReceived", "chargeFirstProcessed"]);
		const processedGraph = atStep(trace, "providerCharge", "graph");
		const processedEdge = processedGraph.items.find(item => item.role === "relation" &&
			item.source.relationIds?.includes("charge"));
		expect((processedEdge?.data as { sentCurrent?: number }).sentCurrent).toBe(0);
		expect((processedEdge?.data as { observedCurrent?: number }).observedCurrent).toBe(2);
		expect(inspector.history("provider").map(item => item.eventId))
			.toEqual(["providerCharged", "providerDedup"]);
		for (const kind of ["graph", "state-table"] as const)
			expectProjectedCell(atStep(trace, "providerCharge", kind), kind,
				"provider", { status: "known", value: { chargedKeys: ["pay-ord-1042"], count: 1 } });

		// A timeout is a standalone write, not a message phase or a
		// positive finding that a reply was lost.
		const timeoutSeq = atStep(trace, "timeout", "sequence");
		const timeoutGraph = atStep(trace, "timeout", "graph");
		const timeoutTable = atStep(trace, "timeout", "state-table");
		for (const view of [timeoutSeq, timeoutGraph, timeoutTable]) {
			expectEvent(view, "workerTimeout", "write");
			expect(view.items.some(item => item.role === "event" &&
				(item.data as { messageId?: string } | undefined)?.messageId === "timeout"))
				.toBe(false);
		}
		expectPhases(timeoutSeq, "paymentFirst", 1, 1, 0, 1,
			["chargeFirstSent", "chargeFirstReceived", "chargeFirstProcessed"]);
		for (const kind of ["graph", "state-table"] as const) {
			const view = kind === "graph" ? timeoutGraph : timeoutTable;
			expectProjectedCell(view, kind, "outcome",
				{ status: "unknown", reason: "no acknowledged provider result at worker" });
			expectProjectedCell(view, kind, "receipt",
				{ status: "known", value: { status: "unconfirmed" } });
			expectProjectedCell(view, kind, "order",
				{ status: "known", value: { status: "awaiting_payment" } });
		}
		expect(inspector.history("outcome")).toHaveLength(1);
		expect(inspector.history("outcome")[0].eventId).toBe("outcomeConfirmed");

		// Retry is a distinct message ID but the exact same idempotency
		// key, and only the simulated provider's explicit write can dedup.
		const retrySeq = atStep(trace, "deduplicate", "sequence");
		expectPhases(retrySeq, "paymentRetry", 1, 1, 0, 1,
			["chargeRetrySent", "chargeRetryReceived", "chargeRetryProcessed"]);
		for (const kind of ["graph", "state-table", "sequence"] as const)
			expectEvent(atStep(trace, "deduplicate", kind), "providerDedup", "write");

		// Sent reply before receipt: the worker is still uncertain, then
		// only explicit writes advance outcome, receipt and order.
		const pendingReply = atStep(trace, "sendReply", "sequence");
		expectPhases(pendingReply, "confirmedResult", 1, 0, 0, 0, ["resultSent"]);
		for (const kind of ["graph", "state-table"] as const)
			expectProjectedCell(atStep(trace, "sendReply", kind), kind,
				"outcome", { status: "unknown", reason: "no acknowledged provider result at worker" });
		const receivedReply = atStep(trace, "receiveReply", "sequence");
		expectPhases(receivedReply, "confirmedResult", 1, 1, 0, 0,
			["resultSent", "resultReceived"]);
		for (const [stepId, eventId, entityId, expected] of [
			["receiveReply", "outcomeConfirmed", "outcome", { status: "approved", key: "pay-ord-1042" }],
			["persistReceipt", "receiptPaid", "receipt", { status: "paid", key: "pay-ord-1042" }],
			["markOrder", "orderPaid", "order", { status: "paid" }],
			["customerReceives", "customerConfirmed", "customer", { checkoutStatus: "confirmed" }],
		] as const) {
			expect(inspector.history(entityId).some(item => item.eventId === eventId)).toBe(true);
			for (const kind of ["graph", "state-table", "sequence"] as const) {
				const view = atStep(trace, stepId, kind);
				expectEvent(view, eventId, "write");
				if (kind !== "sequence")
					expectProjectedCell(view, kind, entityId, { status: "known", value: expected });
			}
		}
		// Send/receipt/processed have exact IDs and totals; there are NO
		// acknowledgements, invented deliveries, or synthetic writes.
		const finalSeq = atStep(trace, "customerReceives", "sequence");
		const authored = example.artifact.steps.flatMap(step => step.events);
		expect(finalSeq.items.filter(item => item.role === "event")
			.flatMap(item => item.source.eventIds ?? []))
			.toEqual(authored.map(event => event.id));
		expect(finalSeq.items.filter(item => item.role === "event" &&
			(item.data as { phase?: string } | undefined)?.phase === "acknowledged"))
			.toHaveLength(0);
		expect(finalSeq.items.filter(item => item.role === "event").length)
			.toBe(authored.length);
		expect(inspector.diff(0, trace.frames.length - 1).length)
			.toBe(authored.filter(event => event.type === "write" || event.type === "topology").length);
	});

	it("factorial stack depth, return chain and final result match factorial(4)", () => {
		const { trace } = reference("factorial");
		const inspector = inspectTrace(trace);
		const depth = trace.frames.map((_, index) => {
			const cell = inspector.valueAt(index, "stack");
			if (cell.status !== "known" || !Array.isArray(cell.value)) throw new Error("Missing stack");
			return cell.value.length;
		});
		expect(depth).toEqual([0, 1, 2, 3, 4, 3, 2, 1, 0]);
		expect(trace.frames.map((_, i) => inspector.valueAt(i, "returned")))
			.toEqual([null, null, null, null, null, 1, 2, 6, 24]
				.map(value => ({ status: "known", value })));
		const expected = [1, 2, 3, 4].reduce((product, n) => product * n, 1);
		expect(expected).toBe(24);
		expect(knownAt(trace, "return4", "result")).toBe(expected);
		expect(inspector.history("stack").map(entry => entry.eventId))
			.toEqual(["push4", "push3", "push2", "push1", "pop1", "pop2", "pop3", "pop4"]);
		expect(inspector.causalEvidenceOf("factorialResult").status).toBe("unmodeled");
	});

	it("matrix C independently equals A × B and every cell is one nested write", () => {
		const { trace } = reference("matrix");
		const inspector = inspectTrace(trace);
		const A = inspector.valueAt(0, "left"), B = inspector.valueAt(0, "right");
		if (A.status !== "known" || B.status !== "known" ||
			!Array.isArray(A.value) || !Array.isArray(B.value))
			throw new Error("Missing matrices");
		const a = A.value as number[][];
		const b = B.value as number[][];
		const expected = a.map(row =>
			b[0].map((_, col) => row.reduce((sum, v, k) => sum + v * b[k][col], 0)));
		expect(expected).toEqual([[19, 22], [43, 50]]);
		expect(knownAt(trace, "cell11", "result")).toEqual(expected);
		const outputEvents = inspector.history("result");
		expect(outputEvents.map(e => [e.eventId, e.path]))
			.toEqual([
				["write00", [0, 0]], ["write01", [0, 1]],
				["write10", [1, 0]], ["write11", [1, 1]],
			]);
		for (const [stepId, row, col, expectedCell] of [
			["cell00", 0, 0, 19], ["cell01", 0, 1, 22],
			["cell10", 1, 0, 43], ["cell11", 1, 1, 50],
		] as const) {
			expect(inspector.valueAt(frameIndex(trace, stepId), "result", [row, col]))
				.toEqual({ status: "known", value: expectedCell });
		}
		expect(inspector.history("left")).toEqual([]);
		expect(inspector.history("right")).toEqual([]);
	});

	it("binary addition computes each low-to-high carry and 5-bit unsigned result", () => {
		const { trace } = reference("binary");
		const inspector = inspectTrace(trace);
		let carry = 0;
		const a = [1, 0, 1, 1], b = [0, 1, 1, 0];
		for (let bit = 0; bit < 4; bit++) {
			const value = a[3 - bit] + b[3 - bit] + carry;
			const frame = frameIndex(trace, "bit" + bit);
			expect(inspector.valueAt(frame, "sum", [4 - bit])).toEqual({
				status: "known", value: value % 2,
			});
			carry = Math.floor(value / 2);
			expect(inspector.valueAt(frame, "carry")).toEqual({ status: "known", value: carry });
		}
		expect(carry).toBe(1);
		expect(knownAt(trace, "finalCarry", "sum")).toEqual([1, 0, 0, 0, 1]);
		expect(knownAt(trace, "finalCarry", "decimal")).toBe(11 + 6);
		expect(inspector.history("sum").map(x => x.eventId))
			.toEqual(["sumBit0", "sumBit1", "sumBit2", "sumBit3", "leadingCarry"]);
	});

	it("checkout never upgrades a send or timeout to receipt, charge or payment persistence", () => {
		const { trace, example } = reference("checkout");
		const inspector = inspectTrace(trace);
		expect(knownAt(trace, "sendCharge", "provider"))
			.toEqual({ chargedKeys: [], count: 0 });
		expect(knownAt(trace, "providerCharge", "provider"))
			.toEqual({ chargedKeys: ["pay-ord-1042"], count: 1 });
		expect(inspector.valueAt(frameIndex(trace, "timeout"), "outcome").status)
			.toBe("unknown");
		expect(knownAt(trace, "timeout", "receipt")).toEqual({ status: "unconfirmed" });
		expect(knownAt(trace, "timeout", "order")).toEqual({ status: "awaiting_payment" });
		expect(knownAt(trace, "deduplicate", "provider"))
			.toEqual({ chargedKeys: ["pay-ord-1042"], count: 1 });
		expect(inspector.valueAt(frameIndex(trace, "sendReply"), "outcome").status)
			.toBe("unknown");
		expect(knownAt(trace, "receiveReply", "outcome"))
			.toEqual({ status: "approved", key: "pay-ord-1042" });
		expect(knownAt(trace, "receiveReply", "receipt")).toEqual({ status: "unconfirmed" });
		expect(knownAt(trace, "persistReceipt", "receipt"))
			.toEqual({ status: "paid", key: "pay-ord-1042" });
		expect(knownAt(trace, "persistReceipt", "order")).toEqual({ status: "awaiting_payment" });
		expect(knownAt(trace, "markOrder", "order")).toEqual({ status: "paid" });
		expect(knownAt(trace, "notifyCustomer", "customer"))
			.toEqual({ checkoutStatus: "submitted" });
		expect(knownAt(trace, "customerReceives", "customer"))
			.toEqual({ checkoutStatus: "confirmed" });
		const sent = byId(example.artifact, "chargeFirstSent");
		const retried = byId(example.artifact, "chargeRetrySent");
		if (sent.type !== "message" || retried.type !== "message")
			throw new Error("Missing modeled charge sends");
		expect(sent.messageId).not.toBe(retried.messageId);
		expect(sent.payload).toMatchObject({ key: "pay-ord-1042" });
		expect(retried.payload).toMatchObject({ key: "pay-ord-1042" });
		expect(inspector.transfersFor("charge").filter(e =>
			e.type === "message" && e.phase === "acknowledged")).toHaveLength(0);
		expect(inspector.history("provider").map(e => e.eventId))
			.toEqual(["providerCharged", "providerDedup"]);
		expect(inspector.history("receipt").map(e => e.eventId)).toEqual(["receiptPaid"]);
		expect(inspector.history("order").map(e => e.eventId))
			.toEqual(["orderPending", "orderPaid"]);
		const sequence = projectView(inspector, { kind: "sequence", frameIndex: trace.frames.length - 1 });
		expect(sequence.kind).toBe("sequence");
		expect(sequence.summary.length).toBeGreaterThan(0);
		expect(example.caveats.join(" ")).toMatch(/fictional|hypothetical/i);
		expect(example.caveats.join(" ")).toMatch(/not.*proof|no.*proof|not.*guarantee/i);
	});
});

function parsedAgain(json: string): VisualArtifact {
	return parseArtifactJson(json);
}
