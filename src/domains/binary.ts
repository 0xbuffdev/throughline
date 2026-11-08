import type { ThlBlock } from "../dsl.js";
import { type Program, ProgramError } from "../model.js";
import { tracer } from "../tracer.js";
import { sourceLine, sourceLines } from "./lines.js";

/**
 * `thl binary` — ripple-carry addition, one beat per bit (LSB first).
 *
 *   ```thl binary
 *   a = 1011
 *   b = 0110
 *   ```
 *
 * Operands are 1–16 binary digits. The sum row is MSB-first with a
 * leading carry-out slot; bits fill right-to-left as carries ripple.
 */
export type BinaryParams = { a: string; b: string };

const BITS = /^[01]{1,16}$/;

export function parseBinary(ast: ThlBlock): BinaryParams {
	const found = new Map<string, string>();
	for (const { text, line } of sourceLines(ast)) {
		const entry = text.match(/^(a|b)\s*=\s*([01]+)\s*$/);
		if (!entry?.[1] || !entry[2])
			throw new ProgramError([
				{ message: "Expected a = <bits> or b = <bits>.", line },
			]);
		const key = entry[1];
		const digits = entry[2];
		if (!BITS.test(digits))
			throw new ProgramError([
				{ message: "Operands are 1–16 binary digits.", line },
			]);
		if (found.has(key))
			throw new ProgramError([
				{ message: `Duplicate operand "${key}".`, line },
			]);
		found.set(key, digits);
	}
	const a = found.get("a");
	const b = found.get("b");
	if (!a || !b)
		throw new ProgramError([
			{
				message: "Binary needs both a = <bits> and b = <bits>.",
				line: sourceLine(ast),
			},
		]);
	return { a, b };
}

export function buildBinary({ a, b }: BinaryParams): Program {
	const t = tracer();
	const n = Math.max(a.length, b.length);
	const A = a.padStart(n, "0");
	const B = b.padStart(n, "0");
	t.node("a", "A", Number.parseInt(A, 2), { lane: "Binary", view: "bits" });
	t.node("b", "B", Number.parseInt(B, 2), { lane: "Binary", view: "bits" });
	// Sum row: MSB-first with a leading carry-out slot (index 0).
	t.node("sum", "Sum", Array<string | number>(n + 1).fill("·"), {
		lane: "Binary",
		view: "array",
	});
	t.node("carry", "Carry", 0, { lane: "Binary", view: "number" });
	let carry = 0;
	const sums: number[] = [];
	for (let r = 0; r < n; r++) {
		const x = Number(A[n - 1 - r]);
		const y = Number(B[n - 1 - r]);
		const total = x + y + carry;
		const cin = carry;
		const bit = total & 1;
		carry = total >> 1;
		sums.unshift(bit);
		t.step(`bit ${r}`, (s) => {
			s.focus(`a[${r}]`, `b[${r}]`, `sum[${n - r}]`, "carry");
			s.set(`sum[${n - r}]`, bit);
			s.set("carry", carry);
			s.note(
				`bit ${r}: ${x} + ${y} + carry ${cin} = ${total}, so write ${bit} and carry ${carry}`,
			);
		});
	}
	const carryOut = carry;
	const result = `${carryOut}${sums.join("")}`;
	t.step("Result", (s) => {
		s.focus("sum", "carry");
		s.set("sum[0]", carryOut);
		s.note(
			carryOut
				? `The last carry becomes the top bit: ${A} + ${B} = ${result}`
				: `No final carry: ${A} + ${B} = ${result}`,
		);
	});
	return t.program();
}
