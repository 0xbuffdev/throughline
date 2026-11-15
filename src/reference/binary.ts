import type { VisualArtifact } from "../v2/model.js";
import { known, step, write, type ReferenceExample } from "./model.js";

/**
 * Four-bit unsigned ripple-carry addition. The leading fifth bit is explicit.
 * This is one checked example, not a general-purpose binary interpreter.
 */
const left = [1, 0, 1, 1]; // 11
const right = [0, 1, 1, 0]; // 6
const operations = [
	{ bit: 0, index: 3, a: 1, b: 0, inCarry: 0, outBit: 1, outCarry: 0 },
	{ bit: 1, index: 2, a: 1, b: 1, inCarry: 0, outBit: 0, outCarry: 1 },
	{ bit: 2, index: 1, a: 0, b: 1, inCarry: 1, outBit: 0, outCarry: 1 },
	{ bit: 3, index: 0, a: 1, b: 0, inCarry: 1, outBit: 0, outCarry: 1 },
] as const;

const artifact: VisualArtifact = {
	schemaVersion: 2,
	id: "binaryAddition",
	title: "4-bit unsigned addition — 1011 + 0110",
	origins: [{ id: "author", kind: "authored",
		description: "Authored arithmetic with independently checked carry truth" }],
	entities: [
		{ id: "left", label: "Operand A (MSB-first)" },
		{ id: "right", label: "Operand B (MSB-first)" },
		{ id: "sum", label: "Five-bit sum (MSB-first)" },
		{ id: "carry", label: "Current carry-out" },
		{ id: "decimal", label: "Final unsigned sum" },
	],
	relations: [
		{ id: "operandA", from: "left", to: "sum", label: "Declared addend A" },
		{ id: "operandB", from: "right", to: "sum", label: "Declared addend B" },
	],
	initialState: {
		left: known(left), right: known(right),
		sum: known([0, 0, 0, 0, 0]),
		carry: known(0), decimal: known(null),
	},
	steps: [
		...operations.map(({ bit, index, a, b, inCarry, outBit, outCarry }) =>
			step("bit" + bit, "Add bit " + bit + " (from right)",
				a + " + " + b + " + carry " + inCarry + " = " +
				(outBit + 2 * outCarry) + "; output " + outBit +
				", carry " + outCarry + ".",
				[
					write("sumBit" + bit, "sum", outBit, [index + 1]),
					write("carryBit" + bit, "carry", outCarry),
				], ["left", "right", "sum", "carry"])),
		step("finalCarry", "Commit the leading carry and decimal result",
			"The highest carry-out is 1. The explicit result is 10001₂ = 17₁₀.",
			[
				write("leadingCarry", "sum", 1, [0]),
				write("decimalSum", "decimal", 17),
			], ["sum", "decimal"]),
	],
	claims: [
		{ id: "unsignedSum", kind: "explanation", originId: "author",
			text: "For the declared 4-bit unsigned operands, 1011₂ + 0110₂ = 10001₂ = 17.",
			evidenceEventIds: ["sumBit0", "sumBit1", "sumBit2", "sumBit3",
				"leadingCarry", "decimalSum"], review: "reviewed" },
	],
	views: [{ kind: "state-table", priority: 0 }, { kind: "graph", priority: 1 }],
};

export const binaryReference: ReferenceExample = {
	id: "binary",
	title: "Binary addition",
	description: "Inspect each low-to-high bit write and carry in a 4-bit addition.",
	artifact,
	explanation: "Add 1011₂ (11) to 0110₂ (6), starting at the least significant bit. The output bits, right to left, are 1, 0, 0 and 0. A carry-out of 1 remains after the highest operand bit, so the full five-bit result is 10001₂ = 17. Each carry and output bit is an explicit modeled write.",
	questions: [
		{ id: "binaryFirstCarry", question: "At which bit position does the first carry become 1?",
			expectedAnswer: "At bit 1 from the right: 1 + 1 + 0 yields bit 0 and carry 1.",
			evidenceEventIds: ["sumBit1", "carryBit1"] },
		{ id: "binaryWidth", question: "Why is the answer five bits wide?",
			expectedAnswer: "The most significant 4-bit addition produces a carry-out of 1, which is explicitly stored as the leading fifth bit.",
			evidenceEventIds: ["carryBit3", "leadingCarry"] },
		{ id: "binaryTotal", question: "What is the exact unsigned decimal result?",
			expectedAnswer: "17; 11 + 6 = 17, represented as 10001 in binary.",
			evidenceEventIds: ["leadingCarry", "decimalSum"] },
	],
	caveats: [
		"This is unsigned 4-bit operand arithmetic with a five-bit result, not signed two's-complement addition or overflow behavior for a fixed-width machine.",
		"The relation lines indicate operand dependencies; no bus transfer or hardware propagation timing is modeled.",
	],
};
