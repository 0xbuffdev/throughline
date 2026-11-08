import type { ThlBlock } from "../dsl.js";
import { COMPILATION_LIMITS } from "../limits.js";
import { type Program, ProgramError, type Value, type View } from "../model.js";
import { type StepApi, tracer } from "../tracer.js";
import { sourceLines } from "./lines.js";

const NAME = "[A-Za-z][\\w-]*";

/**
 * `thl bindings` — variable slots, primitives vs heap references.
 *
 * Subset: `let`/`const <name> = <json>`, `<name> = <json|name>`,
 * `<name>.push(<json>, ...)`. Arrays/objects live on the heap (`o1`…);
 * everything else is a primitive held inline. `const` is not enforced.
 */
export type BindOp =
	| { kind: "declare"; name: string; value: Value; from?: string; line: number }
	| {
			kind: "assign";
			name: string;
			value: Value;
			from?: string;
			line: number;
	  }
	| { kind: "push"; name: string; items: Value[]; line: number };

export type BindParams = { ops: BindOp[] };

const isHeapValue = (value: Value): boolean =>
	Array.isArray(value) || (typeof value === "object" && value !== null);

const show = (value: Value): string => JSON.stringify(value) ?? "null";

export function parseBindings(ast: ThlBlock): BindParams {
	const ops: BindOp[] = [];
	const declared = new Set<string>();
	const lines = sourceLines(ast);
	if (lines.length > COMPILATION_LIMITS.steps)
		throw new ProgramError([
			{
				message: `Bindings exceed ${COMPILATION_LIMITS.steps} steps.`,
				line: lines[COMPILATION_LIMITS.steps].line,
			},
		]);
	for (const { text, line } of lines) {
		const fail = (message: string): never => {
			throw new ProgramError([{ message, line }]);
		};
		const json = (source: string): Value => {
			try {
				return JSON.parse(source) as Value;
			} catch {
				return fail("Expected a JSON value (quote strings).");
			}
		};
		const bare = (source: string): string | null =>
			new RegExp(`^${NAME}$`).test(source) &&
			!/^"(?:[^"\\]|\\.)*"$/.test(source)
				? source
				: null;
		const declare = text.match(
			new RegExp(`^(?:let|const)\\s+(${NAME})\\s*=\\s*(.+)$`),
		);
		if (declare) {
			const name = declare[1] ?? "";
			const rhs = (declare[2] ?? "").trim();
			if (declared.has(name)) fail(`Duplicate variable "${name}".`);
			const ref = bare(rhs);
			if (ref) {
				if (!declared.has(ref)) fail(`Unknown variable "${ref}".`);
				declared.add(name);
				ops.push({ kind: "declare", name, value: null, from: ref, line });
				continue;
			}
			declared.add(name);
			ops.push({ kind: "declare", name, value: json(rhs), line });
			continue;
		}
		const push = text.match(new RegExp(`^(${NAME})\\.push\\((.*)\\)$`));
		if (push) {
			const name = push[1] ?? "";
			if (!declared.has(name)) fail(`Unknown variable "${name}".`);
			let items: Value[];
			try {
				items = JSON.parse(`[${push[2] ?? ""}]`) as Value[];
			} catch {
				throw new ProgramError([
					{ message: "Expected push arguments as JSON values.", line },
				]);
			}
			ops.push({ kind: "push", name, items, line });
			continue;
		}
		const assign = text.match(new RegExp(`^(${NAME})\\s*=\\s*(.+)$`));
		if (assign) {
			const name = assign[1] ?? "";
			if (!declared.has(name)) fail(`Unknown variable "${name}".`);
			const rhs = (assign[2] ?? "").trim();
			const ref = bare(rhs);
			if (ref) {
				if (!declared.has(ref)) fail(`Unknown variable "${ref}".`);
				ops.push({ kind: "assign", name, value: null, from: ref, line });
				continue;
			}
			ops.push({ kind: "assign", name, value: json(rhs), line });
			continue;
		}
		fail(
			"Unknown statement. Use let <name> = <json>, <name> = <json|name>, or <name>.push(<json>).",
		);
	}
	return { ops };
}

export function buildBindings(params: BindParams): Program {
	const t = tracer();
	t.group("Stack", "column").group("Heap", "column");
	// First pass: discover slots and heap allocations so edges are static.
	const vars: string[] = [];
	const heapViews = new Map<string, View>();
	const slot: Map<string, { heap: string } | { value: Value }> = new Map();
	const edges: { id: string; from: string; to: string }[] = [];
	const edgeId = (from: string, to: string) => `ref_${from}_${to}`;
	const alloc = (value: Value): string => {
		const id = `o${heapViews.size + 1}`;
		heapViews.set(id, Array.isArray(value) ? "array" : "record");
		return id;
	};
	for (const op of params.ops) {
		if (op.kind === "push") {
			const target = slot.get(op.name);
			if (!target || !("heap" in target))
				throw new ProgramError([
					{
						message: `Cannot push to "${op.name}": not an array.`,
						line: op.line,
					},
				]);
			continue;
		}
		if (!op.from) {
			const value = op.value;
			if (!vars.includes(op.name)) vars.push(op.name);
			if (isHeapValue(value)) {
				const heap = alloc(value);
				slot.set(op.name, { heap });
				edges.push({ id: edgeId(op.name, heap), from: op.name, to: heap });
			} else slot.set(op.name, { value });
			continue;
		}
		if (!vars.includes(op.name)) vars.push(op.name);
		const from = op.from;
		const source = slot.get(from);
		if (!source)
			throw new ProgramError([
				{ message: `Unknown variable "${from}".`, line: op.line },
			]);
		if ("heap" in source) {
			slot.set(op.name, { heap: source.heap });
			edges.push({
				id: edgeId(op.name, source.heap),
				from: op.name,
				to: source.heap,
			});
		} else slot.set(op.name, { value: source.value });
	}
	for (const name of vars)
		t.node(name, name, null, { lane: "Stack", hidden: true });
	for (const [heap, view] of heapViews)
		t.node(heap, heap, null, { lane: "Heap", view, hidden: true });
	const seen = new Set<string>();
	for (const edge of edges) {
		if (seen.has(edge.id)) continue;
		seen.add(edge.id);
		t.link(edge.id, edge.from, edge.to, "ref", { hidden: true });
	}
	// Second pass: narrate each source line as one beat, replaying bindings
	// in order so shared-mutation focus reflects the state at that line.
	const cur = new Map<string, { heap: string } | { value: Value }>();
	const heapLive = new Map<string, Value>();
	let nextHeap = 0;
	const shownPointers = new Map<string, string>();
	const point = (s: StepApi, name: string, heap?: string): void => {
		const previous = shownPointers.get(name);
		if (previous && previous !== heap) s.hide("link", edgeId(name, previous));
		if (heap && previous !== heap) s.show("link", edgeId(name, heap));
		if (heap) shownPointers.set(name, heap);
		else shownPointers.delete(name);
	};
	const sharers = (heap: string, except?: string) =>
		[...cur.entries()]
			.filter(([, binding]) => "heap" in binding && binding.heap === heap)
			.map(([name]) => name)
			.filter((name) => name !== except);
	for (const op of params.ops) {
		if (op.kind === "push") {
			const binding = cur.get(op.name);
			const heap = binding && "heap" in binding ? binding.heap : "";
			const current = heapLive.get(heap);
			if (!Array.isArray(current))
				throw new ProgramError([
					{
						message: `Cannot push to "${op.name}": not an array.`,
						line: op.line,
					},
				]);
			const next = [...current, ...op.items];
			heapLive.set(heap, next);
			const others = sharers(heap, op.name);
			t.step(`${op.name}.push(${op.items.map(show).join(", ")})`, (s) => {
				s.focus(op.name, heap, ...others);
				s.set(heap, next);
				s.note(
					others.length
						? `push mutates the shared object, so ${others.join(", ")} see it too.`
						: `push appends to ${heap}.`,
				);
			});
			continue;
		}
		if (!op.from) {
			const label =
				op.kind === "declare"
					? `let ${op.name} = ${show(op.value)}`
					: `${op.name} = ${show(op.value)}`;
			if (isHeapValue(op.value)) {
				nextHeap += 1;
				const heap = `o${nextHeap}`;
				const heapValue = op.value;
				cur.set(op.name, { heap });
				heapLive.set(heap, heapValue);
				t.step(label, (s) => {
					s.show("node", op.name);
					s.show("node", heap);
					point(s, op.name, heap);
					s.focus(op.name);
					s.set(op.name, heap);
					s.set(heap, heapValue);
					s.send(edgeId(op.name, heap), heapValue);
					s.note(
						op.kind === "declare"
							? `A new object lives on the heap. ${op.name} holds a reference to it.`
							: `Rebinding ${op.name} moves its arrow to a new object.`,
					);
				});
			} else if (op.kind === "declare") {
				const prim = op.value;
				cur.set(op.name, { value: prim });
				t.step(label, (s) => {
					s.show("node", op.name);
					s.focus(op.name);
					s.set(op.name, prim);
					s.note(
						`${op.name} is a primitive. The slot holds ${show(prim)} itself.`,
					);
				});
			} else {
				const prim = op.value;
				cur.set(op.name, { value: prim });
				t.step(label, (s) => {
					point(s, op.name);
					s.focus(op.name);
					s.set(op.name, prim);
					s.note(`Reassigning ${op.name} changes only ${op.name}.`);
				});
			}
			continue;
		}
		const from = op.from;
		const keyword = op.kind === "declare" ? "let " : "";
		const source = cur.get(from);
		if (source && "heap" in source) {
			const heap = source.heap;
			cur.set(op.name, { heap });
			const heapValue: Value = heapLive.get(heap) ?? null;
			t.step(`${keyword}${op.name} = ${from}`, (s) => {
				s.show("node", op.name);
				point(s, op.name, heap);
				s.focus(op.name, from);
				s.set(op.name, heap);
				s.send(edgeId(op.name, heap), heapValue);
				s.note(
					"Copying a reference copies the arrow, not the array. Two names, one object.",
				);
			});
		} else {
			const value: Value = source && "value" in source ? source.value : null;
			cur.set(op.name, { value });
			t.step(`${keyword}${op.name} = ${from}`, (s) => {
				s.show("node", op.name);
				point(s, op.name);
				s.focus(op.name, from);
				s.set(op.name, value);
				s.note(
					`${op.name} gets a copy of ${show(value)}. Two independent slots.`,
				);
			});
		}
	}
	return t.program();
}
