import type { ThlBlock } from "../dsl.js";
import { type Program, ProgramError, type Value } from "../model.js";
import { tracer } from "../tracer.js";
import { sourceLine, sourceLines } from "./lines.js";

/**
 * `thl matrix` — matrix multiplication, one beat per output cell.
 *
 *   ```thl matrix
 *   A = [[1,2],[3,4]]
 *   B = [[5,6],[7,8]]
 *   ```
 *
 * Both operands are rectangular number grids, at most 4×4, with matching
 * inner dimensions. Each beat dots one row of A with one column of B.
 */
export type MatrixParams = { a: number[][]; b: number[][] };

const parseGrid = (source: string, line: number): number[][] => {
	let value: Value;
	try {
		value = JSON.parse(source) as Value;
	} catch {
		throw new ProgramError([
			{ message: "Expected a JSON grid like [[1,2],[3,4]].", line },
		]);
	}
	if (
		!Array.isArray(value) ||
		value.length < 1 ||
		value.length > 4 ||
		value.some(
			(row) =>
				!Array.isArray(row) ||
				row.length < 1 ||
				row.length > 4 ||
				row.length !== (value[0] as Value[]).length ||
				row.some((cell) => typeof cell !== "number" || !Number.isFinite(cell)),
		)
	)
		throw new ProgramError([
			{
				message:
					"Grids are 1–4 rows of 1–4 finite numbers, all rows equal length.",
				line,
			},
		]);
	return value as number[][];
};

export function parseMatrix(ast: ThlBlock): MatrixParams {
	const found = new Map<string, { grid: number[][]; line: number }>();
	for (const { text, line } of sourceLines(ast)) {
		const entry = text.match(/^(A|B)\s*=\s*(.+)$/);
		if (!entry?.[1] || entry[2] === undefined)
			throw new ProgramError([
				{ message: "Expected A = <grid> or B = <grid>.", line },
			]);
		if (found.has(entry[1]))
			throw new ProgramError([
				{ message: `Duplicate operand "${entry[1]}".`, line },
			]);
		found.set(entry[1], { grid: parseGrid(entry[2], line), line });
	}
	const a = found.get("A");
	const b = found.get("B");
	if (!a || !b)
		throw new ProgramError([
			{
				message: "Matrix needs both A = <grid> and B = <grid>.",
				line: sourceLine(ast),
			},
		]);
	if (a.grid[0]?.length !== b.grid.length)
		throw new ProgramError([
			{
				message: `Inner dimensions mismatch: A has ${a.grid[0]?.length} columns but B has ${b.grid.length} rows.`,
				line: b.line,
			},
		]);
	return { a: a.grid, b: b.grid };
}

export function buildMatrix({ a, b }: MatrixParams): Program {
	const t = tracer();
	t.group("Matrices", "row").group("Work", "row");
	const rows = a.length;
	const cols = b[0]?.length;
	const inner = b.length;
	t.node("A", "A", a, { lane: "Matrices", view: "matrix" });
	t.node("B", "B", b, { lane: "Matrices", view: "matrix" });
	t.node(
		"C",
		"C = A × B",
		Array.from({ length: rows }, () => Array<string | number>(cols).fill("·")),
		{ lane: "Matrices", view: "matrix" },
	);
	t.node("work", "Terms", [], { lane: "Work", view: "array" });
	t.link("readA", "A", "C", "row");
	t.link("readB", "B", "C", "col");
	for (let i = 0; i < rows; i++) {
		for (let j = 0; j < cols; j++) {
			const terms = Array.from({ length: inner }, (_, k) => a[i][k] * b[k][j]);
			const total = terms.reduce((sum, term) => sum + term, 0);
			const column = Array.from({ length: inner }, (_, k) => `B[${k}][${j}]`);
			t.step(`C[${i}][${j}]`, (s) => {
				s.focus(`A[${i}]`, `C[${i}][${j}]`, ...column);
				s.set(`C[${i}][${j}]`, total);
				s.set("work", terms);
				s.send("readA", a[i]);
				s.send(
					"readB",
					b.map((row) => row[j]),
				);
				s.note(
					`C[${i}][${j}] = ${terms.join(" + ")} = ${total}. Row ${i} of A dot column ${j} of B.`,
				);
			});
		}
	}
	return t.program();
}
