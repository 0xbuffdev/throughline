import { COMPILATION_LIMITS, createBudget } from "./limits.js";
import {
	type Diagnostic,
	type Event,
	GROUP_LAYOUTS,
	type Program,
	ProgramError,
	type Snapshot,
	type Trace,
	type Value,
	VIEWS,
} from "./model.js";
import { overlaps, parseTarget, setAt, type Target } from "./path.js";

const owns = (object: object, key: string) => Object.hasOwn(object, key);
const isValue = (value: unknown, depth = 0): boolean => {
	if (depth > 32) return false;
	if (value === null || typeof value === "string" || typeof value === "boolean")
		return true;
	if (typeof value === "number") return Number.isFinite(value);
	if (Array.isArray(value))
		return value.every((item) => isValue(item, depth + 1));
	return (
		typeof value === "object" &&
		value !== null &&
		Object.getPrototypeOf(value) === Object.prototype &&
		Object.values(value).every((item) => isValue(item, depth + 1))
	);
};
const record = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);
const identifier = (value: unknown): value is string =>
	typeof value === "string" && /^[A-Za-z][\w-]*$/.test(value);

export function validateProgram(input: unknown): asserts input is Program {
	if (
		!record(input) ||
		input.version !== 1 ||
		!Array.isArray(input.entities) ||
		!Array.isArray(input.relations) ||
		!Array.isArray(input.beats)
	) {
		throw new ProgramError([
			{ message: "Expected version: 1 and entities, relations, beats arrays." },
		]);
	}
	if (
		input.entities.length > COMPILATION_LIMITS.entities ||
		input.relations.length > COMPILATION_LIMITS.relations ||
		input.beats.length > COMPILATION_LIMITS.steps
	) {
		throw new ProgramError([
			{
				message:
					"Program exceeds limits (200 entities, 1000 relations, 2000 steps).",
			},
		]);
	}
	let eventCount = 0;
	for (const beat of input.beats) {
		if (record(beat) && Array.isArray(beat.events))
			eventCount += beat.events.length;
		if (eventCount > COMPILATION_LIMITS.events)
			throw new ProgramError([
				{ message: `Program exceeds ${COMPILATION_LIMITS.events} events.` },
			]);
	}
	createBudget("Program", COMPILATION_LIMITS.programUnits)(input);
	const diagnostics: Diagnostic[] = [];
	if (input.groups !== undefined) {
		if (
			!Array.isArray(input.groups) ||
			input.groups.length > 200 ||
			input.groups.some(
				(group) =>
					!record(group) ||
					typeof group.name !== "string" ||
					!(GROUP_LAYOUTS as readonly unknown[]).includes(group.layout),
			)
		)
			diagnostics.push({
				message:
					"Groups require a name and a row, column, or tree layout (at most 200).",
			});
		else if (
			new Set(input.groups.map((group) => group.name)).size !==
			input.groups.length
		)
			diagnostics.push({ message: "Duplicate group name." });
	}
	const entities = new Set<string>();
	const relations = new Set<string>();
	for (const entity of input.entities) {
		if (
			!record(entity) ||
			!identifier(entity.id) ||
			typeof entity.label !== "string" ||
			!owns(entity, "value") ||
			!isValue(entity.value) ||
			(entity.hidden !== undefined && typeof entity.hidden !== "boolean") ||
			(entity.lane !== undefined && typeof entity.lane !== "string") ||
			(entity.view !== undefined &&
				!(VIEWS as readonly unknown[]).includes(entity.view))
		) {
			diagnostics.push({
				message: `Each entity needs a valid id, label, JSON value, optional string lane, and optional view (${VIEWS.join(", ")}).`,
			});
			continue;
		}
		if (entities.has(entity.id))
			diagnostics.push({ message: `Duplicate entity “${entity.id}”.` });
		entities.add(entity.id);
	}
	for (const relation of input.relations) {
		if (
			!record(relation) ||
			!identifier(relation.id) ||
			typeof relation.from !== "string" ||
			typeof relation.to !== "string" ||
			(relation.hidden !== undefined && typeof relation.hidden !== "boolean") ||
			(relation.label !== undefined && typeof relation.label !== "string")
		) {
			diagnostics.push({
				message:
					"Each relation needs an id, from, to, and optional string label.",
			});
			continue;
		}
		if (relations.has(relation.id))
			diagnostics.push({ message: `Duplicate relation “${relation.id}”.` });
		relations.add(relation.id);
		if (!entities.has(relation.from) || !entities.has(relation.to))
			diagnostics.push({
				message: `Relation “${relation.id}” references an unknown entity.`,
			});
	}
	input.beats.forEach((beat, index) => {
		if (
			!record(beat) ||
			typeof beat.label !== "string" ||
			!Array.isArray(beat.events)
		) {
			diagnostics.push({
				message: "Each step needs a label and events array.",
				beat: index,
			});
			return;
		}
		const writes: Target[] = [];
		const visibility = new Set<string>();
		for (const event of beat.events) {
			const fail = (message: string) =>
				diagnostics.push({
					message,
					beat: index,
					line:
						record(event) &&
						record(event.source) &&
						Number.isInteger(event.source.line)
							? Number(event.source.line)
							: undefined,
				});
			if (!record(event)) {
				fail("Expected an event object.");
				continue;
			}
			if (event.op === "show" || event.op === "hide") {
				const ids =
					event.kind === "node"
						? entities
						: event.kind === "link"
							? relations
							: null;
				if (!ids || typeof event.id !== "string" || !ids.has(event.id))
					fail(`Unknown ${String(event.kind)} “${String(event.id)}”.`);
				const key = `${event.kind}:${event.id}`;
				if (visibility.has(key))
					fail(`Conflicting visibility for “${String(event.id)}” in one step.`);
				visibility.add(key);
			} else if (event.op === "set") {
				const target =
					typeof event.target === "string" ? parseTarget(event.target) : null;
				if (!target || !entities.has(target.id))
					fail(`Unknown set target “${String(event.target)}”.`);
				if (!owns(event, "value") || !isValue(event.value))
					fail("set requires a finite JSON value.");
				if (target) {
					if (
						writes.some(
							(write) =>
								write.id === target.id && overlaps(write.path, target.path),
						)
					)
						fail(
							`Conflicting writes to “${event.target}” in one step; split into separate steps.`,
						);
					writes.push(target);
				}
			} else if (event.op === "focus") {
				if (
					!Array.isArray(event.targets) ||
					event.targets.some((text) => {
						const target = typeof text === "string" ? parseTarget(text) : null;
						return !target || !entities.has(target.id);
					})
				)
					fail(
						"focus requires known entity ids, optionally with a position such as data[3].",
					);
			} else if (event.op === "send") {
				if (
					typeof event.relation !== "string" ||
					!relations.has(event.relation)
				)
					fail(`Unknown relation “${String(event.relation)}”.`);
				if (owns(event, "value") && !isValue(event.value))
					fail("send requires a finite JSON value.");
			} else if (event.op === "note") {
				if (typeof event.text !== "string") fail("note requires text.");
			} else fail(`Unknown event operation “${String(event.op)}”.`);
			if (
				event.source !== undefined &&
				(!record(event.source) ||
					!Number.isInteger(event.source.line) ||
					Number(event.source.line) < 1)
			)
				fail("Source line must be a positive integer.");
		}
		if (
			beat.source !== undefined &&
			(!record(beat.source) ||
				!Number.isInteger(beat.source.line) ||
				Number(beat.source.line) < 1)
		)
			diagnostics.push({
				message: "Step source line must be a positive integer.",
				beat: index,
			});
	});
	if (diagnostics.length) throw new ProgramError(diagnostics);
}

export function reduceBeat(
	previous: Snapshot,
	events: readonly Event[],
): Snapshot {
	const writes = new Map<string, { path: Target["path"]; value: Value }[]>();
	const nodes = new Map<string, boolean>();
	const links = new Map<string, boolean>();
	for (const event of events) {
		if (event.op === "show" || event.op === "hide")
			(event.kind === "node" ? nodes : links).set(
				event.id,
				event.op === "hide",
			);
		if (event.op !== "set") continue;
		const target = parseTarget(event.target);
		if (!target) throw new Error(`Invalid target “${event.target}”.`);
		writes.set(target.id, [
			...(writes.get(target.id) ?? []),
			{ path: target.path, value: event.value },
		]);
	}
	const state: Snapshot = {
		entities: previous.entities.map((entity) => {
			const list = writes.get(entity.id);
			return list || nodes.has(entity.id)
				? {
						...entity,
						...(nodes.has(entity.id) ? { hidden: nodes.get(entity.id)! } : {}),
						value: list
							? list.reduce(
									(value, write) => setAt(value, write.path, write.value),
									entity.value,
								)
							: entity.value,
					}
				: entity;
		}),
		relations: previous.relations.map((relation) =>
			links.has(relation.id)
				? { ...relation, hidden: links.get(relation.id)! }
				: relation,
		),
		active: [
			...new Set(
				events.flatMap((event) =>
					event.op === "focus"
						? event.targets
						: event.op === "set"
							? [event.target]
							: [],
				),
			),
		],
		changed: events.flatMap((event) =>
			event.op === "set" ? [event.target] : [],
		),
		transfers: events.flatMap((event) =>
			event.op === "send"
				? [{ relation: event.relation, value: event.value }]
				: [],
		),
		notes: events.flatMap((event) => (event.op === "note" ? [event.text] : [])),
	};
	for (const transfer of state.transfers) {
		const relation = state.relations.find(
			(candidate) => candidate.id === transfer.relation,
		)!;
		if (relation.hidden)
			throw new Error(`Cannot send along hidden link “${relation.id}”.`);
		if (
			state.entities.some(
				(entity) =>
					entity.hidden &&
					(entity.id === relation.from || entity.id === relation.to),
			)
		)
			throw new Error(`Cannot send along “${relation.id}” with a hidden node.`);
	}
	return state;
}

export function compileProgram(input: unknown): Trace {
	validateProgram(input);
	const program: Program = JSON.parse(JSON.stringify(input));
	let state: Snapshot = {
		entities: program.entities,
		relations: program.relations,
		active: [],
		changed: [],
		transfers: [],
		notes: [],
	};
	const frames: Trace["frames"] = [
		{ index: 0, label: "Initial state", state, events: [] },
	];
	const account = createBudget("Trace", COMPILATION_LIMITS.traceUnits);
	account({ version: 1, groups: program.groups, frames });
	program.beats.forEach((beat, index) => {
		try {
			state = reduceBeat(state, beat.events);
			const frame = {
				index: index + 1,
				label: beat.label,
				state,
				events: beat.events,
				source: beat.source,
			};
			account(frame);
			frames.push(frame);
		} catch (error) {
			throw new ProgramError([
				{
					message: error instanceof Error ? error.message : String(error),
					beat: index,
					line: beat.source?.line,
				},
			]);
		}
	});
	return {
		version: 1,
		frames,
		...(program.groups ? { groups: program.groups } : {}),
	};
}
