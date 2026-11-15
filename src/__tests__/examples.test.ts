import { describe, expect, it } from "vitest";
import {
	artifactSha256, compileArtifact, inspectTrace, parseArtifactJson, projectView,
	resolveThlBody, serializeArtifact, sha256Text, validateArtifact,
	type CompiledTrace, type SemanticEvent, type VisualArtifact,
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
		expect(outputEvents.map(e => [e.eventId, e.path, e.after]))
			.toEqual([
				["write00", [0, 0], { status: "known", value: 19 }],
				["write01", [0, 1], { status: "known", value: 22 }],
				["write10", [1, 0], { status: "known", value: 43 }],
				["write11", [1, 1], { status: "known", value: 50 }],
			]);
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
