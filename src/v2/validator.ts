import {
	ARTIFACT_LIMITS,
	ARTIFACT_SCHEMA_VERSION,
	type Cell,
	type Path,
	type VisualArtifact,
} from "./model.js";

/** A data-only error: paths refer to input fields, never evaluated code. */
export class ArtifactValidationError extends Error {
	constructor(
		public readonly path: string,
		message: string,
	) {
		super(path + ": " + message);
		this.name = "ArtifactValidationError";
	}
}

type RecordValue = Record<string, unknown>;
const ID = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;
const UNSAFE_KEYS = new Set(["__proto__", "prototype", "constructor"]);
const ORIGIN_KINDS = new Set([
	"authored",
	"computed",
	"simulated",
	"observed",
	"ai-proposed",
]);
const EVENT_TYPES = new Set(["write", "topology", "message", "observation"]);
const MESSAGE_PHASES = new Set(["sent", "received", "acknowledged", "processed"]);
const VIEW_KINDS = new Set(["graph", "sequence", "state-table"]);

function fail(path: string, message: string): never {
	throw new ArtifactValidationError(path, message);
}

function has(object: RecordValue, key: string): boolean {
	return Object.prototype.hasOwnProperty.call(object, key);
}

function wellFormed(text: string, path: string): void {
	for (let i = 0; i < text.length; i++) {
		const char = text.charCodeAt(i);
		if (char >= 0xd800 && char <= 0xdbff) {
			const next = text.charCodeAt(++i);
			if (!(next >= 0xdc00 && next <= 0xdfff))
				fail(path, "lone UTF-16 high surrogate is not valid JSON text");
		} else if (char >= 0xdc00 && char <= 0xdfff) {
			fail(path, "lone UTF-16 low surrogate is not valid JSON text");
		}
	}
}

class Budget {
	private units = 0;
	visit(path: string): void {
		if (++this.units > ARTIFACT_LIMITS.validationUnits)
			fail(path, "validation work limit exceeded (1,000,000 units)");
	}
}

/**
 * Copy untrusted input through own data descriptors only. Never traverse a
 * prototype, read a getter, invoke toJSON, or allow executable values.
 * Repeated object aliases are expanded/charged; ancestor cycles are rejected.
 */
function detachJson(
	input: unknown,
	path: string,
	depth: number,
	budget: Budget,
	ancestors: WeakSet<object>,
): unknown {
	if (depth > ARTIFACT_LIMITS.jsonDepth)
		fail(path, "JSON nesting exceeds 32");
	budget.visit(path);
	if (input === null || typeof input === "boolean") return input;
	if (typeof input === "string") {
		wellFormed(input, path);
		return input;
	}
	if (typeof input === "number") {
		if (!Number.isFinite(input)) fail(path, "JSON numbers must be finite");
		return input;
	}
	if (typeof input !== "object") fail(path, "expected JSON data");
	if (ancestors.has(input)) fail(path, "cyclic object is not JSON data");

	const isArray = Array.isArray(input);
	const proto = Object.getPrototypeOf(input);
	if (!isArray && proto !== Object.prototype && proto !== null)
		fail(path, "expected a plain JSON object");
	if (isArray && proto !== Array.prototype)
		fail(path, "expected an ordinary JSON array");

	ancestors.add(input);
	const keys = Reflect.ownKeys(input);
	if (isArray) {
		const length = input.length;
		if (length > ARTIFACT_LIMITS.validationUnits)
			fail(path, "array exceeds validation work limit");
		if (keys.length !== length + 1)
			fail(path, "array must be dense and contain no extra properties");
		const copy: unknown[] = [];
		for (let i = 0; i < length; i++) {
			const key = String(i);
			const desc = Object.getOwnPropertyDescriptor(input, key);
			if (!desc || !desc.enumerable || !("value" in desc))
				fail(path + "[" + i + "]", "array entry must be an own data value");
			budget.visit(path + "[" + i + "]");
			// Define own numeric properties: array assignment/push may also
			// trigger poisoned inherited numeric setters.
			Object.defineProperty(copy, key, {
				value: detachJson(desc.value, path + "[" + i + "]", depth + 1, budget, ancestors),
				enumerable: true,
				writable: true,
				configurable: true,
			});
		}
		ancestors.delete(input);
		return copy;
	}

	// Null-prototype data records never invoke inherited accessors on assignment
	// and cannot inherit host-defined toJSON methods.
	const copy: RecordValue = Object.create(null) as RecordValue;
	for (const key of keys) {
		if (typeof key !== "string") fail(path, "symbol keys are not JSON data");
		budget.visit(path + "." + key);
		wellFormed(key, path);
		if (UNSAFE_KEYS.has(key)) fail(path + "." + key, "unsafe record key");
		const desc = Object.getOwnPropertyDescriptor(input, key);
		if (!desc || !desc.enumerable || !("value" in desc))
			fail(path + "." + key, "expected an enumerable own data property");
		copy[key] = detachJson(desc.value, path + "." + key, depth + 1, budget, ancestors);
	}
	ancestors.delete(input);
	return copy;
}

function record(input: unknown, path: string, required: string[], optional: string[] = []): RecordValue {
	if (!input || typeof input !== "object" || Array.isArray(input))
		fail(path, "expected a JSON object");
	const value = input as RecordValue;
	const allowed = new Set([...required, ...optional]);
	for (const key of Object.keys(value))
		if (!allowed.has(key)) fail(path + "." + key, "unexpected property");
	for (const key of required)
		if (!has(value, key)) fail(path + "." + key, "required property missing");
	return value;
}

function array(input: unknown, path: string, maximum?: number): unknown[] {
	if (!Array.isArray(input)) fail(path, "expected an array");
	if (maximum !== undefined && input.length > maximum)
		fail(path, "exceeds maximum " + maximum);
	return input;
}

function string(input: unknown, path: string): string {
	if (typeof input !== "string") fail(path, "expected a string");
	return input;
}

function identifier(input: unknown, path: string): string {
	const id = string(input, path);
	if (!ID.test(id)) fail(path, "invalid identifier; expected " + String(ID));
	return id;
}

function boolean(input: unknown, path: string): void {
	if (typeof input !== "boolean") fail(path, "expected a boolean");
}

function enumeration(input: unknown, path: string, allowed: ReadonlySet<string>): void {
	if (typeof input !== "string" || !allowed.has(input))
		fail(path, "unsupported value");
}

function optionalString(value: RecordValue, key: string, path: string): void {
	if (has(value, key)) string(value[key], path + "." + key);
}

function optionalBoolean(value: RecordValue, key: string, path: string): void {
	if (has(value, key)) boolean(value[key], path + "." + key);
}

function unique(id: string, ids: Set<string>, path: string): void {
	if (ids.has(id)) fail(path, "duplicate identifier: " + id);
	ids.add(id);
}

function cell(input: unknown, path: string): Cell {
	const v = record(input, path, ["status"], ["value", "reason"]);
	if (v.status === "known") {
		record(input, path, ["status", "value"]);
		// detachJson has already validated the entire nested JSON value.
	} else if (v.status === "unknown") {
		record(input, path, ["status"], ["reason"]);
		optionalString(v, "reason", path);
	} else {
		fail(path + ".status", "expected known or unknown");
	}
	return input as Cell;
}

function member(id: unknown, ids: ReadonlySet<string>, path: string): string {
	const key = identifier(id, path);
	if (!ids.has(key)) fail(path, "undeclared reference: " + key);
	return key;
}

function pathSegments(input: unknown, path: string): void {
	for (const [i, segment] of array(input, path).entries()) {
		const at = path + "[" + i + "]";
		if (typeof segment === "string") {
			wellFormed(segment, at);
			if (UNSAFE_KEYS.has(segment)) fail(at, "unsafe record path segment");
		} else if (typeof segment !== "number" || !Number.isSafeInteger(segment) || segment < 0) {
			fail(at, "expected a plain record key or nonnegative safe array index");
		}
	}
}

/** Shared path vocabulary for artifact writes and pure inspector queries. */
export function assertQueryPath(input: unknown): asserts input is Path {
	const segments = array(input, "$.path");
	if (segments.length > ARTIFACT_LIMITS.jsonDepth)
		fail("$.path", "query path exceeds maximum depth 32");
	pathSegments(segments, "$.path");
}

function timestamp(input: unknown, path: string): void {
	const value = string(input, path);
	const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|[+-]\d{2}:\d{2})$/.exec(value);
	if (!match) fail(path, "expected RFC 3339 timestamp with explicit offset");
	const [, year, month, day, hours, minutes, seconds, zone] = match;
	const y = Number(year), m = Number(month), d = Number(day);
	const days = [31, y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0) ? 29 : 28,
		31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
	if (y === 0 || m < 1 || m > 12 || d < 1 || d > days[m - 1] ||
		Number(hours) > 23 || Number(minutes) > 59 || Number(seconds) > 59)
		fail(path, "invalid RFC 3339 calendar date or time");
	if (zone !== "Z") {
		const zh = Number(zone.slice(1, 3));
		const zm = Number(zone.slice(4, 6));
		if (zh > 23 || zm > 59) fail(path, "invalid RFC 3339 offset");
	}
	if (!Number.isFinite(Date.parse(value))) fail(path, "unparseable timestamp");
}

function groupDepth(
	id: string,
	groups: ReadonlyMap<string, string | undefined>,
	active: Set<string>,
	memo: Map<string, number>,
): number {
	const existing = memo.get(id);
	if (existing !== undefined) return existing;
	if (active.has(id)) fail("$.groups", "group parent cycle at " + id);
	active.add(id);
	const parent = groups.get(id);
	const depth = 1 + (parent === undefined ? 0 : groupDepth(parent, groups, active, memo));
	if (depth > ARTIFACT_LIMITS.jsonDepth)
		fail("$.groups", "group tree exceeds depth 32");
	active.delete(id);
	memo.set(id, depth);
	return depth;
}

function validateStructured(data: unknown): VisualArtifact {
	const v = record(data, "$", [
		"schemaVersion", "id", "origins", "entities", "relations", "initialState", "steps",
	], ["title", "groups", "claims", "views"]);
	if (v.schemaVersion !== ARTIFACT_SCHEMA_VERSION) fail("$.schemaVersion", "unsupported schema version");
	identifier(v.id, "$.id");
	optionalString(v, "title", "$");

	const origins = new Set<string>();
	for (const [i, item] of array(v.origins, "$.origins").entries()) {
		const p = "$.origins[" + i + "]";
		const r = record(item, p, ["id", "kind"], ["description", "reference"]);
		unique(identifier(r.id, p + ".id"), origins, p + ".id");
		enumeration(r.kind, p + ".kind", ORIGIN_KINDS);
		optionalString(r, "description", p);
		optionalString(r, "reference", p);
	}

	const groups = new Map<string, string | undefined>();
	for (const [i, item] of array(v.groups ?? [], "$.groups", ARTIFACT_LIMITS.groups).entries()) {
		const p = "$.groups[" + i + "]";
		const r = record(item, p, ["id", "label"], ["parentId"]);
		const id = identifier(r.id, p + ".id");
		if (groups.has(id)) fail(p + ".id", "duplicate group ID");
		string(r.label, p + ".label");
		groups.set(id, has(r, "parentId") ? identifier(r.parentId, p + ".parentId") : undefined);
	}
	for (const [id, parent] of groups) {
		if (parent !== undefined && !groups.has(parent))
			fail("$.groups", "undeclared parent for " + id + ": " + parent);
	}
	const depths = new Map<string, number>();
	for (const id of groups.keys()) groupDepth(id, groups, new Set(), depths);

	const entities = new Set<string>();
	for (const [i, item] of array(v.entities, "$.entities", ARTIFACT_LIMITS.entities).entries()) {
		const p = "$.entities[" + i + "]";
		const r = record(item, p, ["id", "label"], ["kind", "groupId", "initiallyPresent"]);
		unique(identifier(r.id, p + ".id"), entities, p + ".id");
		string(r.label, p + ".label");
		optionalString(r, "kind", p);
		if (has(r, "groupId")) member(r.groupId, new Set(groups.keys()), p + ".groupId");
		optionalBoolean(r, "initiallyPresent", p);
	}

	const relations = new Set<string>();
	for (const [i, item] of array(v.relations, "$.relations", ARTIFACT_LIMITS.relations).entries()) {
		const p = "$.relations[" + i + "]";
		const r = record(item, p, ["id", "from", "to"], ["label", "kind", "initiallyPresent"]);
		unique(identifier(r.id, p + ".id"), relations, p + ".id");
		member(r.from, entities, p + ".from");
		member(r.to, entities, p + ".to");
		optionalString(r, "label", p);
		optionalString(r, "kind", p);
		optionalBoolean(r, "initiallyPresent", p);
	}

	const state = record(v.initialState, "$.initialState", [], [...entities]);
	for (const entityId of entities) {
		if (!has(state, entityId)) fail("$.initialState." + entityId, "missing initial cell");
		cell(state[entityId], "$.initialState." + entityId);
	}

	const eventIds = new Set<string>();
	const messageRelations = new Map<string, string>();
	let eventCount = 0;
	const stepIds = new Set<string>();
	for (const [i, item] of array(v.steps, "$.steps", ARTIFACT_LIMITS.steps).entries()) {
		const p = "$.steps[" + i + "]";
		const r = record(item, p, ["id", "label", "events"],
			["note", "focusEntityIds", "time"]);
		unique(identifier(r.id, p + ".id"), stepIds, p + ".id");
		string(r.label, p + ".label");
		optionalString(r, "note", p);
		if (has(r, "focusEntityIds"))
			for (const [j, id] of array(r.focusEntityIds, p + ".focusEntityIds").entries())
				member(id, entities, p + ".focusEntityIds[" + j + "]");
		if (has(r, "time")) {
			const time = record(r.time, p + ".time", ["kind"], ["tick", "iso8601"]);
			if (time.kind === "logical") {
				record(time, p + ".time", ["kind", "tick"]);
				if (!Number.isSafeInteger(time.tick) || (time.tick as number) < 0)
					fail(p + ".time.tick", "expected a nonnegative safe integer");
			} else if (time.kind === "wall") {
				record(time, p + ".time", ["kind", "iso8601"]);
				timestamp(time.iso8601, p + ".time.iso8601");
			} else fail(p + ".time.kind", "unsupported clock kind");
		}
		const events = array(r.events, p + ".events");
		eventCount += events.length;
		if (eventCount > ARTIFACT_LIMITS.events)
			fail(p + ".events", "more than 10,000 events");
		const currentIds = new Set<string>();
		for (const [j, itemEvent] of events.entries()) {
			const ep = p + ".events[" + j + "]";
			const e = record(itemEvent, ep, ["id", "originId", "type"],
				["dependsOn", "entityId", "path", "value", "target", "targetId",
					"present", "relationId", "messageId", "phase", "payload"]);
			const id = identifier(e.id, ep + ".id");
			if (eventIds.has(id) || currentIds.has(id))
				fail(ep + ".id", "duplicate event ID: " + id);
			currentIds.add(id);
			member(e.originId, origins, ep + ".originId");
			enumeration(e.type, ep + ".type", EVENT_TYPES);
			if (has(e, "dependsOn"))
				for (const [k, dependency] of array(e.dependsOn, ep + ".dependsOn").entries())
					member(dependency, eventIds, ep + ".dependsOn[" + k + "]");
			if (e.type === "write") {
				record(e, ep, ["id", "originId", "type", "entityId", "path", "value"], ["dependsOn"]);
				member(e.entityId, entities, ep + ".entityId");
				pathSegments(e.path, ep + ".path");
				cell(e.value, ep + ".value");
				if ((e.path as unknown[]).length && (e.value as Cell).status === "unknown")
					fail(ep + ".value", "unknown cells can only be written at the entity root");
			} else if (e.type === "topology") {
				record(e, ep, ["id", "originId", "type", "target", "targetId", "present"],
					["dependsOn"]);
				enumeration(e.target, ep + ".target", new Set(["entity", "relation"]));
				member(e.targetId, e.target === "entity" ? entities : relations, ep + ".targetId");
				boolean(e.present, ep + ".present");
			} else if (e.type === "message") {
				record(e, ep, ["id", "originId", "type", "relationId", "messageId", "phase"],
					["dependsOn", "payload"]);
				const relation = member(e.relationId, relations, ep + ".relationId");
				const message = identifier(e.messageId, ep + ".messageId");
				enumeration(e.phase, ep + ".phase", MESSAGE_PHASES);
				const existing = messageRelations.get(message);
				if (existing !== undefined && existing !== relation)
					fail(ep + ".messageId", "message ID already belongs to relation " + existing);
				messageRelations.set(message, relation);
			} else {
				record(e, ep, ["id", "originId", "type", "entityId", "value"], ["dependsOn"]);
				member(e.entityId, entities, ep + ".entityId");
				cell(e.value, ep + ".value");
			}
		}
		for (const id of currentIds) eventIds.add(id);
	}

	const claims = new Set<string>();
	for (const [i, item] of array(v.claims ?? [], "$.claims", ARTIFACT_LIMITS.claims).entries()) {
		const p = "$.claims[" + i + "]";
		const r = record(item, p,
			["id", "text", "kind", "originId", "evidenceEventIds", "review"]);
		unique(identifier(r.id, p + ".id"), claims, p + ".id");
		string(r.text, p + ".text");
		enumeration(r.kind, p + ".kind", new Set(["causal", "assumption", "explanation"]));
		member(r.originId, origins, p + ".originId");
		for (const [j, e] of array(r.evidenceEventIds, p + ".evidenceEventIds").entries())
			member(e, eventIds, p + ".evidenceEventIds[" + j + "]");
		enumeration(r.review, p + ".review", new Set(["unreviewed", "reviewed"]));
	}
	for (const [i, item] of array(v.views ?? [], "$.views").entries()) {
		const p = "$.views[" + i + "]";
		const r = record(item, p, ["kind", "priority"]);
		enumeration(r.kind, p + ".kind", VIEW_KINDS);
		if (!Number.isSafeInteger(r.priority) || (r.priority as number) < 0)
			fail(p + ".priority", "expected nonnegative safe integer");
	}
	return data as VisualArtifact;
}

function freezeJson(value: unknown): void {
	if (!value || typeof value !== "object") return;
	for (const child of Object.values(value)) freezeJson(child);
	Object.freeze(value);
}

function inspect(input: unknown, budget: Budget): VisualArtifact {
	// Version rejection is intentionally before nested-input traversal.
	if (!input || typeof input !== "object" || Array.isArray(input))
		fail("$", "expected a schema-2 artifact object");
	const version = Object.getOwnPropertyDescriptor(input, "schemaVersion");
	if (!version || !("value" in version) || version.value !== ARTIFACT_SCHEMA_VERSION)
		fail("$.schemaVersion", "unsupported artifact schema; expected 2");
	const data = detachJson(input, "$", 0, budget, new WeakSet());
	const validated = validateStructured(data);
	const json = encodeJson(validated);
	if (new TextEncoder().encode(json).byteLength > ARTIFACT_LIMITS.artifactBytes)
		fail("$", "serialized artifact exceeds 4 MiB UTF-8");
	freezeJson(validated);
	return validated;
}

/** Validate an arbitrary read-side value; output is detached and deeply frozen. */
export function validateArtifact(input: unknown): VisualArtifact {
	try {
		return inspect(input, new Budget());
	} catch (error) {
		if (error instanceof ArtifactValidationError) throw error;
		throw new ArtifactValidationError("$", "unable to safely inspect JSON input");
	}
}

/**
 * Strict JSON lexical gate. JSON.parse alone loses duplicate object keys and
 * must never silently choose the last value. The parser is inert and bounded.
 */
function rejectDuplicateJsonKeys(source: string, budget: Budget): void {
	let cursor = 0;
	const whitespace = (): void => {
		while (cursor < source.length && /[\u0020\u0009\u000a\u000d]/.test(source[cursor]))
			cursor++;
	};
	const syntax = (message: string): never => fail("$", "invalid JSON at offset " + cursor + ": " + message);
	const scanString = (): string => {
		if (source[cursor] !== '"') syntax("expected string");
		const start = cursor++;
		while (cursor < source.length) {
			const char = source[cursor++];
			if (char === '"') return JSON.parse(source.slice(start, cursor)) as string;
			if (char === "\\") {
				const escaped = source[cursor++];
				if (escaped === "u") {
					if (!/^[\da-fA-F]{4}$/.test(source.slice(cursor, cursor + 4)))
						syntax("invalid unicode escape");
					cursor += 4;
				} else if (!'"\\/bfnrt'.includes(escaped ?? ""))
					syntax("invalid escape");
			} else if (char.charCodeAt(0) < 0x20) syntax("unescaped control character");
		}
		return syntax("unterminated string");
	};
	const scanValue = (depth: number): void => {
		if (depth > ARTIFACT_LIMITS.jsonDepth) syntax("JSON nesting exceeds 32");
		budget.visit("$");
		whitespace();
		const char = source[cursor];
		if (char === "{") {
			cursor++;
			const seen = new Set<string>();
			whitespace();
			if (source[cursor] === "}") { cursor++; return; }
			for (;;) {
				whitespace();
				const key = scanString();
				budget.visit("$." + key);
				if (seen.has(key)) syntax("duplicate object key: " + key);
				seen.add(key);
				whitespace();
				if (source[cursor++] !== ":") syntax("expected colon");
				scanValue(depth + 1);
				whitespace();
				const next = source[cursor++];
				if (next === "}") return;
				if (next !== ",") syntax("expected comma or closing brace");
			}
		}
		if (char === "[") {
			cursor++;
			whitespace();
			if (source[cursor] === "]") { cursor++; return; }
			for (;;) {
				budget.visit("$[]");
				scanValue(depth + 1);
				whitespace();
				const next = source[cursor++];
				if (next === "]") return;
				if (next !== ",") syntax("expected comma or closing bracket");
			}
		}
		if (char === '"') { scanString(); return; }
		for (const token of ["true", "false", "null"]) {
			if (source.startsWith(token, cursor)) { cursor += token.length; return; }
		}
		const match = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(source.slice(cursor));
		if (!match) return syntax("expected JSON value");
		if (!Number.isFinite(Number(match[0]))) syntax("nonfinite JSON number");
		cursor += match[0].length;
	};
	scanValue(0);
	whitespace();
	if (cursor !== source.length) syntax("unexpected trailing content");
}

/** Parse serialized artifacts, rejecting duplicate JSON keys before decoding. */
export function parseArtifactJson(source: string): VisualArtifact {
	if (typeof source !== "string") fail("$", "expected JSON text");
	if (new TextEncoder().encode(source).byteLength > ARTIFACT_LIMITS.artifactBytes)
		fail("$", "serialized artifact exceeds 4 MiB UTF-8");
	const budget = new Budget();
	rejectDuplicateJsonKeys(source, budget);
	let parsed: unknown;
	try {
		parsed = JSON.parse(source) as unknown;
	} catch {
		fail("$", "invalid JSON text");
	}
	return inspect(parsed, budget);
}

/**
 * Encode already-validated JSON data without passing objects/arrays to
 * JSON.stringify: even ordinary arrays inherit Object.prototype.toJSON.
 * Primitive encoding is safe; key sorting provides canonical object order.
 */
function encodeJson(value: unknown): string {
	if (value === null || typeof value !== "object")
		return JSON.stringify(value);
	if (Array.isArray(value)) {
		let output = "[";
		for (let i = 0; i < value.length; i++)
			output += (i ? "," : "") + encodeJson(value[i]);
		return output + "]";
	}
	let output = "{";
	let first = true;
	for (const key of Object.keys(value).sort()) {
		output += (first ? "" : ",") + JSON.stringify(key) + ":" +
			encodeJson((value as RecordValue)[key]);
		first = false;
	}
	return output + "}";
}

/** Stable key-ordered UTF-8-safe JSON. Frames are compiler output, never input. */
export function serializeArtifact(input: VisualArtifact): string {
	return encodeJson(validateArtifact(input));
}
