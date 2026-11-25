import { describe, expect, it } from "vitest";
import {
	artifactSha256, compileArtifact, inspectTrace, parseArtifactJson, parseThlBody,
	projectInspection, projectView, resolveThlBody, serializeArtifact, validateArtifact,
	type ReadonlyJsonValue, type ValidatedArtifact, type VisualArtifact,
} from "../index.js";
import { isReadonlyJsonArray } from "../v2/model.js";
import { retryCheckout } from "./v2-sequence-fixture.js";

function source(): VisualArtifact {
	const artifact = retryCheckout();
	artifact.initialState.client = { status: "known", value: { timeout: false, ack: false, nested: [{ n: 1 }] } };
	const send = artifact.steps[0].events[0];
	if (send.type !== "message") throw new Error("fixture drift");
	send.payload = { nested: [1, 2] };
	artifact.claims = [{ id: "claim", text: "Reviewed editorial claim", kind: "explanation",
		originId: "author", review: "reviewed", evidenceEventIds: ["retrySent"] }];
	return artifact;
}

// Typechecked by tsc but deliberately never invoked.
function readonlyTypes(input: VisualArtifact) {
	input.title = "author may edit";
	input.steps[0].events.push({ id: "x", originId: "author", type: "observation",
		entityId: "client", value: { status: "known", value: [1] } });
	const editable = input.initialState.client;
	if (editable.status === "known" && Array.isArray(editable.value)) editable.value.push(2);
	const validated: ValidatedArtifact = validateArtifact(input);
	const parsed = parseArtifactJson(serializeArtifact(validated));
	const resolved = resolveThlBody(serializeArtifact(parsed));
	const body = parseThlBody(serializeArtifact(resolved));
	const trace = compileArtifact(resolved);
	compileArtifact(input); artifactSha256(trace.artifact); serializeArtifact(trace.artifact);
	// @ts-expect-error validated artifact arrays are readonly
	validated.steps.push(input.steps[0]);
	// @ts-expect-error nested event list is readonly
	parsed.steps[0].events.pop();
	// @ts-expect-error resolved artifact entity field is readonly
	resolved.entities[0].label = "changed";
	if (body.kind === "artifact") {
		// @ts-expect-error parsed body contains a readonly artifact
		body.value.initialState.client = { status: "unknown" };
	}
	// @ts-expect-error validated record cannot be replaced
	validated.initialState.client = { status: "unknown" };
	// @ts-expect-error frame metadata is readonly
	trace.frames[0].id = "changed";
	// @ts-expect-error compiled trace cannot replace its artifact
	trace.artifact = validated;
	const inspector = inspectTrace(trace);
	// @ts-expect-error frozen inspector method cannot be replaced
	inspector.valueAt = () => ({ status: "absent" });
	const cell = inspector.valueAt(0, "client");
	if (cell.status === "known") {
		// @ts-expect-error cell value cannot be replaced
		cell.value = null;
		nestedJsonTypes(cell.value);
	}
	const event = inspector.eventById("originalSent");
	// @ts-expect-error event identity cannot be rewritten
	event.id = "changed";
	if (event.type === "message" && event.payload !== undefined) nestedJsonTypes(event.payload);
	// @ts-expect-error dependency array elements cannot be changed
	inspector.dependenciesOf("retrySent")[0].originId = "changed";
	// @ts-expect-error causal evidence dependency arrays are readonly
	inspector.causalEvidenceOf("retrySent").dependencies.pop();
	// @ts-expect-error event arrays cannot be mutated
	inspector.eventsFor("client").pop();
	// @ts-expect-error transfer event fields cannot be changed
	inspector.transfersFor("request")[0].id = "changed";
	// @ts-expect-error claim evidence references cannot be mutated
	inspector.claimsForEvent("retrySent")[0].evidenceEventIds.push("x");
	// @ts-expect-error relation fields cannot be rewritten
	inspector.relationsFor("client")[0].label = "changed";
	// @ts-expect-error history result is readonly
	inspector.history("client")[0].path.push("x");
	const delta = inspector.diff(0, 4)[0];
	if (delta.kind === "write" && delta.after.status === "known") nestedJsonTypes(delta.after.value);
	const view = projectView(inspector, { kind: "graph", frameIndex: 5 });
	// @ts-expect-error view items cannot be replaced
	view.items[0] = view.items[1];
	if (view.items[0].data !== undefined) nestedJsonTypes(view.items[0].data);
	const explanation = projectInspection(inspector, { frameIndex: 5, eventId: "retrySent" });
	// @ts-expect-error Explain event is readonly
	explanation.focused!.evidence.event.id = "changed";
	// @ts-expect-error Explain claim provenance is readonly
	explanation.focused!.claims[0].claim.evidenceEventIds.pop();
	// @ts-expect-error Explain origin is readonly
	explanation.focused!.evidence.origin.kind = "observed";
}
function nestedJsonTypes(value: ReadonlyJsonValue) {
	if (isReadonlyJsonArray(value)) {
		// @ts-expect-error readonly nested JSON arrays cannot be mutated
		value.push(1);
		// @ts-expect-error readonly array index cannot be written
		value[0] = null;
	} else if (value !== null && typeof value === "object") {
		// @ts-expect-error readonly nested JSON record cannot be mutated
		value.n = 1;
	}
}
void readonlyTypes;

function assertDeepFrozen(value: unknown, visited = new WeakSet<object>()) {
	if (value === null || typeof value !== "object" || visited.has(value)) return;
	visited.add(value);
	expect(Object.isFrozen(value)).toBe(true);
	for (const child of Object.values(value)) assertDeepFrozen(child, visited);
}
describe("F28 — readonly output contract", () => {
	it("detaches authored input and deeply freezes every published data surface", () => {
		const authored = source();
		const canonical = serializeArtifact(authored);
		const validated = validateArtifact(authored);
		const parsed = parseArtifactJson(canonical);
		const resolved = resolveThlBody(canonical);
		const trace = compileArtifact(validated);
		const inspector = inspectTrace(trace);
		const inspection = projectInspection(inspector, { frameIndex: 5,
			entityId: "client", eventId: "retrySent", relationId: "request" });
		const outputs = [validated, parsed, resolved, parseThlBody(canonical), trace, inspector,
			inspector.stateAt(0), inspector.stateAt(4), inspector.valueAt(0, "client"),
			inspector.valueAt(0, "client", ["nested"]), inspector.diff(0, 5),
			inspector.history("client"), inspector.history("client", ["timeout"]),
			inspector.eventsFor("client"), inspector.transfersFor("request"),
			inspector.dependenciesOf("retrySent"), inspector.causalEvidenceOf("retrySent"),
			inspector.eventById("originalSent"), inspector.claimsForEvent("retrySent"),
			inspector.relationsFor("client"), inspection,
			...(["graph", "sequence", "state-table"] as const).map(kind =>
				projectView(inspector, { kind, frameIndex: 5 }))];
		for (const output of outputs) assertDeepFrozen(output);
		authored.title = "Edited";
		authored.entities[0].label = "Changed";
		const cell = authored.initialState.client;
		if (cell.status !== "known") throw new Error("fixture drift");
		(cell.value as { nested: { n: number }[] }).nested[0].n = 99;
		expect(serializeArtifact(trace.artifact)).toBe(canonical);
		expect(artifactSha256(validated)).toBe(artifactSha256(parsed));
		expect(inspector.valueAt(0, "client", ["nested", 0, "n"])).toEqual({ status: "known", value: 1 });
		const nested = inspector.valueAt(0, "client", ["nested"]);
		if (nested.status !== "known" || !isReadonlyJsonArray(nested.value)) throw new Error("fixture drift");
		expect(Reflect.set(nested.value, "0", null)).toBe(false);
		expect(Reflect.set(nested.value[0] as object, "n", 42)).toBe(false);
		expect(Reflect.set(inspector.eventById("originalSent"), "id", "changed")).toBe(false);
		expect(Reflect.set(trace.frames[0], "label", "changed")).toBe(false);
	});
});
