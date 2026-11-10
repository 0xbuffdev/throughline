import { COMPILATION_LIMITS, createBudget } from "./limits.js";
import type {
	Beat,
	Entity,
	Event,
	GroupLayout,
	Program,
	Value,
	View,
} from "./model.js";
import { ProgramError } from "./model.js";
import { getAt, parseTarget, setAt } from "./path.js";

export type StepApi = {
	set(target: string, value: Value): void;
	focus(...targets: string[]): void;
	send(relation: string, value?: Value): void;
	note(text: string): void;
	show(kind: "node" | "link", id: string): void;
	hide(kind: "node" | "link", id: string): void;
};

export type Tracer = {
	group(name: string, layout: GroupLayout, options?: { id?: string; parentId?: string }): Tracer;
	node(
		id: string,
		label: string,
		value: Value,
		options?: { lane?: string; view?: View; hidden?: boolean },
	): Tracer;
	link(
		id: string,
		from: string,
		to: string,
		label?: string,
		options?: { hidden?: boolean },
	): Tracer;
	get(target: string): Value | undefined;
	step(label: string, body: (step: StepApi) => void): Tracer;
	program(): Program;
};

/** Detach caller-owned data before it becomes part of the recording. */
function captureData<T>(value: T): T {
	createBudget("Program", COMPILATION_LIMITS.programUnits)(value);
	return JSON.parse(JSON.stringify(value)) as T;
}

function checkCount(name: string, count: number, maximum: number): void {
	if (count > maximum)
		throw new ProgramError([
			{ message: `Program exceeds ${maximum} ${name}.` },
		]);
}

/**
 * Computation adapter: run any ordinary algorithm and narrate it.
 * Values written in a step become visible together, exactly like authored steps.
 */
export function tracer(): Tracer {
	const program: Program = {
		version: 1,
		entities: [],
		relations: [],
		beats: [],
	};
	let live = new Map<string, Value>();
	let eventCount = 0;
	let recording = false;
	const account = createBudget("Program", COMPILATION_LIMITS.programUnits);
	const assertIdle = (): void => {
		if (recording) throw new Error("Use the step writer while a step is open.");
	};

	const api: Tracer = {
		group(name, layout, options = {}) {
			assertIdle();
			checkCount(
				"groups",
				(program.groups?.length ?? 0) + 1,
				COMPILATION_LIMITS.entities,
			);
			const group = { name, layout, ...options };
			account(group);
			program.groups ??= [];
			program.groups.push(group);
			return api;
		},
		node(id, label, value, options = {}) {
			assertIdle();
			checkCount(
				"entities",
				program.entities.length + 1,
				COMPILATION_LIMITS.entities,
			);
			const entity: Entity = {
				id,
				label,
				value: captureData(value),
				...(options.lane ? { lane: options.lane } : {}),
				...(options.view ? { view: options.view } : {}),
				...(options.hidden ? { hidden: true } : {}),
			};
			account(entity);
			program.entities.push(entity);
			live.set(id, entity.value);
			return api;
		},
		link(id: string, from: string, to: string, label?: string, options = {}) {
			assertIdle();
			checkCount(
				"relations",
				program.relations.length + 1,
				COMPILATION_LIMITS.relations,
			);
			const relation = {
				id,
				from,
				to,
				...(label ? { label } : {}),
				...(options.hidden ? { hidden: true } : {}),
			};
			account(relation);
			program.relations.push(relation);
			return api;
		},
		/** Current value of a target as of the previous completed step. */
		get(target: string): Value | undefined {
			const parsed = parseTarget(target);
			const value = parsed
				? getAt(live.get(parsed.id), parsed.path)
				: undefined;
			return value === undefined ? undefined : captureData(value);
		},
		step(label: string, body: (step: StepApi) => void) {
			assertIdle();
			checkCount("steps", program.beats.length + 1, COMPILATION_LIMITS.steps);
			const events: Event[] = [];
			const stepBudget = createBudget(
				"Program step",
				COMPILATION_LIMITS.programUnits,
			);
			stepBudget({ label });
			let open = true;
			const append = (event: Event): void => {
				if (!open) throw new Error("This step writer is closed.");
				checkCount(
					"events",
					eventCount + events.length + 1,
					COMPILATION_LIMITS.events,
				);
				stepBudget(event);
				events.push(event);
			};
			recording = true;
			try {
				const result: unknown = body({
					set: (target, value) =>
						append({ op: "set", target, value: captureData(value) }),
					focus: (...targets) => append({ op: "focus", targets }),
					send: (relation, value) =>
						append({
							op: "send",
							relation,
							...(value === undefined ? {} : { value: captureData(value) }),
						}),
					note: (text) => append({ op: "note", text }),
					show: (kind, id) => append({ op: "show", kind, id }),
					hide: (kind, id) => append({ op: "hide", kind, id }),
				});
				if (
					result !== null &&
					typeof result === "object" &&
					"then" in result &&
					typeof result.then === "function"
				) {
					// The rejected callback may resume after the writer closes.
					// Observe that promise so catching this error is sufficient.
					void Promise.resolve(result).catch(() => {});
					throw new Error("Step callbacks must be synchronous.");
				}
			} finally {
				open = false;
				recording = false;
			}
			const beat: Beat = { label, events };
			const pending = new Map(live);
			for (const event of events) {
				if (event.op !== "set") continue;
				const parsed = parseTarget(event.target);
				if (parsed && live.has(parsed.id))
					pending.set(
						parsed.id,
						setAt(pending.get(parsed.id)!, parsed.path, event.value),
					);
			}
			account(beat);
			program.beats.push(beat);
			live = pending;
			eventCount += events.length;
			return api;
		},
		program(): Program {
			return captureData(program);
		},
	};
	return api;
}
