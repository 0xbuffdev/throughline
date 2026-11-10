import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compile } from "../index.js";

describe("public README quick start", () => {
	it("compiles the exact hierarchy fence published in the README", () => {
		const readme = readFileSync(new URL("../../README.md", import.meta.url), "utf8");
		const section = readme.split("## Hierarchical groups and drill-down (TL-I14)")[1]?.split("## Supported domains")[0];
		expect(section).toBeDefined();
		const source = section?.match(/~~~thl flow\n[\s\S]*?\n~~~/)?.[0];
		expect(source).toBeDefined();
		const trace = compile(source!);
		expect(trace.version).toBe(1);
		expect(trace.frames).toHaveLength(2);
		expect(trace.groups?.find((group) => group.id === "worker")?.parentId).toBe("system");
		expect(trace.frames[1].state.transfers.map((transfer) => transfer.relation)).toEqual(["request"]);
	});

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
