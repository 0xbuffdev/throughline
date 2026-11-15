import type { VisualArtifact } from "../v2/model.js";
import { known, step, write, type ReferenceExample } from "./model.js";

/**
 * factorial(4) is a small authored evaluation, not a JavaScript runtime
 * recording. Every push/pop is an explicit new value of the modeled stack.
 */
const stackOf = (levels: readonly number[]) =>
	levels.map(n => ({ n, call: "factorial(" + n + ")", waitingFor: n > 1 ? n - 1 : null }));

const artifact: VisualArtifact = {
	schemaVersion: 2,
	id: "factorialFour",
	title: "Recursive factorial — explicit frames and return values",
	origins: [{ id: "author", kind: "authored",
		description: "Hand-authored mathematical trace; not sampled runtime internals" }],
	groups: [{ id: "recursion", label: "Authored recursive evaluation" }],
	entities: [
		{ id: "stack", label: "Modeled call stack", groupId: "recursion" },
		{ id: "returned", label: "Last returned value", groupId: "recursion" },
		{ id: "result", label: "Final factorial", groupId: "recursion" },
	],
	relations: [
		{ id: "unwind", from: "stack", to: "returned",
			label: "Authored return-value dependency" },
		{ id: "finish", from: "returned", to: "result",
			label: "Final result assignment" },
	],
	initialState: {
		stack: known([]),
		returned: known(null),
		result: known(null),
	},
	steps: [
		step("enter4", "Enter factorial(4)", "Push the outer call; its return awaits factorial(3).",
			[write("push4", "stack", stackOf([4]))], ["stack"]),
		step("enter3", "Enter factorial(3)", "The outer frame is still waiting while factorial(3) calls factorial(2).",
			[write("push3", "stack", stackOf([4, 3]))], ["stack"]),
		step("enter2", "Enter factorial(2)", "Push factorial(2) beneath the two waiting callers.",
			[write("push2", "stack", stackOf([4, 3, 2]))], ["stack"]),
		step("enter1", "Enter factorial(1)", "The base case is reached with four explicitly modeled frames.",
			[write("push1", "stack", stackOf([4, 3, 2, 1]))], ["stack"]),
		step("base1", "Return base case 1", "factorial(1) = 1; pop its frame and return to factorial(2).",
			[write("pop1", "stack", stackOf([4, 3, 2])),
				write("return1", "returned", 1)], ["stack", "returned"]),
		step("return2", "Return factorial(2) = 2", "2 × factorial(1) = 2 × 1 = 2; pop factorial(2).",
			[write("pop2", "stack", stackOf([4, 3])),
				write("value2", "returned", 2)], ["stack", "returned"]),
		step("return3", "Return factorial(3) = 6", "3 × factorial(2) = 3 × 2 = 6; pop factorial(3).",
			[write("pop3", "stack", stackOf([4])),
				write("value6", "returned", 6)], ["stack", "returned"]),
		step("return4", "Return factorial(4) = 24", "4 × factorial(3) = 4 × 6 = 24; close the outer call and store the result.",
			[write("pop4", "stack", stackOf([])),
				write("value24", "returned", 24),
				write("factorialResult", "result", 24)], ["stack", "returned", "result"]),
	],
	claims: [
		{ id: "baseCase", kind: "explanation", originId: "author",
			text: "The modeled base case returns 1; it is not inferred from the call diagram.",
			evidenceEventIds: ["return1"], review: "reviewed" },
		{ id: "total", kind: "explanation", originId: "author",
			text: "factorial(4) = 4 × 3 × 2 × 1 = 24 in this authored evaluation.",
			evidenceEventIds: ["return1", "value2", "value6", "value24", "factorialResult"],
			review: "reviewed" },
	],
	views: [{ kind: "graph", priority: 0 }, { kind: "state-table", priority: 1 }],
};

export const factorialReference: ReferenceExample = {
	id: "factorial",
	title: "Factorial call stack",
	description: "Trace the four modeled stack frames and their explicit return values.",
	artifact,
	explanation: "To evaluate factorial(4), the authored model pushes calls for 4, 3, 2 and 1. The base case returns 1. As each frame unwinds, the returned values are 2, 6 and 24. Each frame and return is an explicit authored write; a drawn link does not execute the recursion.",
	questions: [
		{ id: "factorialDepth", question: "What is the maximum modeled call-stack depth?",
			expectedAnswer: "Four frames, reached at factorial(1), before any return.",
			evidenceEventIds: ["push1"] },
		{ id: "factorialBase", question: "What value does the base case return?",
			expectedAnswer: "1, as explicitly recorded by the base-case return.",
			evidenceEventIds: ["return1"] },
		{ id: "factorialFinal", question: "What does factorial(4) evaluate to, and which step records it?",
			expectedAnswer: "24; the Return factorial(4) step explicitly writes the final result.",
			evidenceEventIds: ["value24", "factorialResult"] },
	],
	caveats: [
		"This is an authored mathematical call-stack model, not a trace of JavaScript, Rust or an actual runtime's stack frames.",
		"Graph relations illustrate declared dependencies; they do not send messages, change values or imply stack layout in physical memory.",
	],
};
