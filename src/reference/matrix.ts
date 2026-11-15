import type { VisualArtifact } from "../v2/model.js";
import { known, step, write, type ReferenceExample } from "./model.js";

/** A 2×2 calculation with each dot product independently testable. */
const left = [[1, 2], [3, 4]];
const right = [[5, 6], [7, 8]];
const cells = [
	{ row: 0, col: 0, products: [5, 14], sum: 19, expression: "1 × 5 + 2 × 7 = 19" },
	{ row: 0, col: 1, products: [6, 16], sum: 22, expression: "1 × 6 + 2 × 8 = 22" },
	{ row: 1, col: 0, products: [15, 28], sum: 43, expression: "3 × 5 + 4 × 7 = 43" },
	{ row: 1, col: 1, products: [18, 32], sum: 50, expression: "3 × 6 + 4 × 8 = 50" },
] as const;

const artifact: VisualArtifact = {
	schemaVersion: 2,
	id: "matrixMultiplyTwo",
	title: "2×2 matrix multiplication — four explicit dot products",
	origins: [{ id: "author", kind: "authored",
		description: "Small checked arithmetic example, not a live numerical algorithm" }],
	entities: [
		{ id: "left", label: "Left matrix A" },
		{ id: "right", label: "Right matrix B" },
		{ id: "result", label: "Computed matrix C" },
		{ id: "terms", label: "Most recent dot-product operands" },
	],
	relations: [
		{ id: "readsA", from: "left", to: "result", label: "Declared left operand" },
		{ id: "readsB", from: "right", to: "result", label: "Declared right operand" },
	],
	initialState: {
		left: known(left),
		right: known(right),
		result: known([[0, 0], [0, 0]]),
		terms: known(null),
	},
	steps: cells.map(({ row, col, products, sum, expression }) =>
		step("cell" + row + col, "Calculate C[" + row + "][" + col + "]",
			"Dot product: " + expression +
			". The result cell and terms are explicit model writes, not inferred by a renderer.",
			[
				write("write" + row + col, "result", sum, [row, col]),
				write("terms" + row + col, "terms", {
					row, column: col, products: [...products], total: sum,
				}),
			], ["left", "right", "result", "terms"])),
	claims: [
		{ id: "rowColumn", kind: "explanation", originId: "author",
			text: "Each modeled C cell is the sum of pairwise products of one row of A and one column of B.",
			evidenceEventIds: ["write00", "write01", "write10", "write11"],
			review: "reviewed" },
	],
	views: [{ kind: "state-table", priority: 0 }, { kind: "graph", priority: 1 }],
};

export const matrixReference: ReferenceExample = {
	id: "matrix",
	title: "Matrix multiplication",
	description: "Calculate all four cells of a 2×2 product, with inspectable row/column terms.",
	artifact,
	explanation: "For A = [[1, 2], [3, 4]] and B = [[5, 6], [7, 8]], each result cell is a row–column dot product. In row-major order, the explicit products produce C[0][0] = 19, C[0][1] = 22, C[1][0] = 43, C[1][1] = 50. The state history exposes each nested write and the corresponding operands.",
	questions: [
		{ id: "matrixFirst", question: "Why is C[0][0] equal to 19?",
			expectedAnswer: "The first row and first column yield 1 × 5 + 2 × 7 = 19.",
			evidenceEventIds: ["terms00", "write00"] },
		{ id: "matrixSecondRow", question: "What is the final second row of C?",
			expectedAnswer: "[43, 50], from 3 × 5 + 4 × 7 and 3 × 6 + 4 × 8.",
			evidenceEventIds: ["write10", "write11"] },
		{ id: "matrixMutation", question: "Does a read-arrow or view calculate a matrix cell?",
			expectedAnswer: "No. Only an explicit write event commits each cell; relations merely identify the declared operands.",
			evidenceEventIds: ["write00", "write01", "write10", "write11"] },
	],
	caveats: [
		"Cell values and dot products are authored and independently checked; the renderer never performs matrix arithmetic.",
		"Zero-filled output cells are an explicitly chosen teaching initialization, not proof that an actual implementation starts with zeroed storage.",
	],
};
