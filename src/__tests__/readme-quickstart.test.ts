import { describe, expect, it } from "vitest";
import { compile } from "../index.js";

describe("public README quick start", () => {
	it("compiles the documented counter example to two frames", () => {
		const source = [
			"```thl flow",
			'node counter "Counter" = 0',
			'step "Increment"',
			"  set counter = 1",
			"  focus counter",
			'  note "Counter now holds one."',
			"```",
		].join("\n");
		const trace = compile(source);

		expect(trace.version).toBe(1);
		expect(trace.frames).toHaveLength(2);
		expect(
			trace.frames[1]?.state.entities.find((entity) => entity.id === "counter")
				?.value,
		).toBe(1);
	});
});
