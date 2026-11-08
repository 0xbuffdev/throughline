import type { ThlBlock } from "../dsl.js";
import { type Program, ProgramError } from "../model.js";
import { tracer } from "../tracer.js";
import { sourceLine, sourceLines } from "./lines.js";

/**
 * `thl callstack` — factorial recursion, push beats then unwind beats.
 *
 *   ```thl callstack
 *   fact 4
 *   ```
 *
 * Depth is 1–6. Frame slots are stack lanes; popped frames clear back to
 * null while return values accumulate in the returns row.
 */
export type CallstackParams = { n: number };

const fact = (k: number): number => (k <= 1 ? 1 : k * fact(k - 1));

export function parseCallstack(ast: ThlBlock): CallstackParams {
	const lines = sourceLines(ast);
	const line = lines[0]?.line ?? sourceLine(ast);
	if (lines.length !== 1)
		throw new ProgramError([
			{ message: "Callstack takes one line: fact <n>.", line },
		]);
	const entry = lines[0]?.text.match(/^fact\s+(\d+)$/);
	if (!entry || entry[1] === undefined)
		throw new ProgramError([{ message: "Expected fact <n>.", line }]);
	const n = Number(entry[1]);
	if (!Number.isInteger(n) || n < 1 || n > 6)
		throw new ProgramError([{ message: "Depth n is 1–6.", line }]);
	return { n };
}

export function buildCallstack({ n }: CallstackParams): Program {
	const t = tracer();
	// slot1 is the bottom of the stack; slot i holds fact(n - i + 1).
	const slot = (k: number): string => `slot${n - k + 1}`;
	for (let i = 1; i <= n; i++)
		t.node(`slot${i}`, `frame ${i}`, null, { lane: "Call stack" });
	t.node("returns", "Returns", Array<string | number>(n).fill("·"), {
		lane: "Returns",
		view: "array",
	});
	for (let k = 1; k < n; k++)
		t.link(`calls${k}`, slot(k + 1), slot(k), "calls");
	for (let k = 1; k <= n; k++) t.link(`ret${k}`, slot(k), "returns", "↩");
	for (let k = n; k >= 1; k--) {
		t.step(`call fact(${k})`, (s) => {
			s.focus(slot(k));
			s.set(
				slot(k),
				k === 1
					? "fact(1) · base case"
					: `fact(${k}) · waiting on fact(${k - 1})`,
			);
			if (k < n) s.send(`calls${k}`, `fact(${k})`);
			s.note(
				k === n
					? `fact(${n}) is called. Each call gets its own frame.`
					: k === 1
						? "Base case: n <= 1. fact(1) returns without another call."
						: `fact(${k}) can't finish yet — it needs fact(${k - 1}). A new frame is pushed.`,
			);
		});
	}
	for (let k = 1; k <= n; k++) {
		const value = fact(k);
		t.step(`return fact(${k})`, (s) => {
			s.focus(slot(k), `returns[${k - 1}]`);
			s.set(slot(k), null);
			s.set(`returns[${k - 1}]`, value);
			s.send(`ret${k}`, value);
			s.note(
				k === 1
					? "fact(1) returns 1. Its frame is popped."
					: `fact(${k}) gets ${fact(k - 1)} back and returns ${k} × ${fact(k - 1)} = ${value}.`,
			);
		});
	}
	t.step("done", (s) => {
		s.focus("returns");
		s.note(`The stack is empty again. fact(${n}) = ${fact(n)}.`);
	});
	return t.program();
}
