import { describe, expect, it } from "vitest";
import { parseThl } from "../../dsl.js";
import { sourceLines } from "../lines.js";

describe("sourceLines", () => {
	it("skips blanks and comments with fence-relative numbers", () => {
		const ast = parseThl(
			"```thl bindings\nlet a = 1\n\n# note\nlet b = 2\n```",
		)!;
		expect(sourceLines(ast)).toEqual([
			{ text: "let a = 1", line: 2 },
			{ text: "let b = 2", line: 5 },
		]);
	});
});
