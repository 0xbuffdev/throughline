import { describe, expect, it } from "vitest";
import {
	STARTER_SOURCE,
	compileWorkbenchSource,
	formatWorkbenchSource,
	markdownForSource,
	unwrapThlFence,
} from "./workbench.js";

describe("public playground authoring boundary", () => {
	it("validates and compiles an editable schema-2 artifact", () => {
		const result = compileWorkbenchSource(STARTER_SOURCE);
		expect(result.kind).toBe("ready");
		if (result.kind !== "ready") return;
		expect(result.trace.artifact.schemaVersion).toBe(2);
		expect(result.trace.frames).toHaveLength(2);
		expect(result.trace.artifact.steps[0].events[0].id).toBe("counterWrite");
	});

	it("rejects schema 1 rather than adapting or inferring it", () => {
		expect(compileWorkbenchSource('{"version":1,"domain":"flow"}').kind).toBe("invalid");
	});

	it("does not compile arbitrary prose or start a resolver", () => {
		const result = compileWorkbenchSource("Explain factorial(4) as a graph.");
		expect(result.kind).toBe("intent");
		expect(formatWorkbenchSource(result)).toBeNull();
	});

	it("rejects invalid JSON, duplicate keys and empty input", () => {
		expect(compileWorkbenchSource('{"schemaVersion":2,').kind).toBe("invalid");
		expect(compileWorkbenchSource('{"schemaVersion":2,"schemaVersion":2}').kind).toBe("invalid");
		expect(compileWorkbenchSource("  ").kind).toBe("invalid");
	});

	it("runs compiler-level atomic-write checks, not only validation", () => {
		const artifact = JSON.parse(STARTER_SOURCE) as {
			steps: Array<{ events: Array<{ id: string; [key: string]: unknown }> }>;
		};
		artifact.steps[0].events.push({ ...artifact.steps[0].events[0], id: "conflictingWrite" });
		const result = compileWorkbenchSource(JSON.stringify(artifact));
		expect(result.kind).toBe("invalid");
		if (result.kind === "invalid") expect(result.path).toContain("steps");
	});

	it("formats only compiled data and exports a single plain thl fence", () => {
		const valid = compileWorkbenchSource(STARTER_SOURCE);
		const formatted = formatWorkbenchSource(valid);
		expect(formatted).not.toBeNull();
		expect(compileWorkbenchSource(formatted ?? "").kind).toBe("ready");
		const fence = String.fromCharCode(96).repeat(3);
		const markdown = markdownForSource(formatted ?? "");
		expect(markdown.startsWith(fence + "thl\n")).toBe(true);
		expect(unwrapThlFence(markdown)).toBe(formatted);
		expect(unwrapThlFence("~~~thl\n" + STARTER_SOURCE + "\n~~~")).toBe(STARTER_SOURCE);
	});

	it("leaves Markdown with additional content untouched", () => {
		const fence = String.fromCharCode(96).repeat(3);
		const multi = "Before\n\n" + fence + "thl\n" + STARTER_SOURCE + "\n" + fence + "\nAfter";
		expect(unwrapThlFence(multi)).toBe(multi);
	});
});
