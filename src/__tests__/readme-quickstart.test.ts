import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compileArtifact, inspectTrace, resolveThlBody } from "../index.js";
import { EXAMPLES } from "../examples.js";

describe("public documentation — schema-2 quick start", () => {
	it("compiles the exact unqualified thl JSON from the user guide offline", () => {
		const guide = readFileSync(new URL("../../docs/user-guide.md", import.meta.url), "utf8");
		const section = guide.split("## Direct JSON quick start")[1]?.split("## Read the four reference models")[0];
		expect(section).toBeDefined();
		const source = section?.match(/~~~thl\n([\s\S]*?)\n~~~/)?.[1];
		expect(source).toBeDefined();
		const trace = compileArtifact(resolveThlBody(source!));
		expect(trace.schemaVersion).toBe(2);
		expect(trace.frames.map(frame => frame.id)).toEqual(["@initial", "increment"]);
		expect(inspectTrace(trace).valueAt(0, "counter")).toEqual({ status: "known", value: 0 });
		expect(inspectTrace(trace).valueAt(1, "counter")).toEqual({ status: "known", value: 1 });
		expect(inspectTrace(trace).history("counter").map(entry => entry.eventId))
			.toEqual(["counterWrite"]);
	});

	it("documents precisely the same four typed examples exported in the package", () => {
		const guide = readFileSync(new URL("../../docs/user-guide.md", import.meta.url), "utf8");
		expect(EXAMPLES.map(example => example.id))
			.toEqual(["factorial", "matrix", "binary", "checkout"]);
		for (const example of EXAMPLES) {
			expect(guide.toLowerCase()).toContain(example.id);
			expect(compileArtifact(example.artifact).frames.length).toBeGreaterThan(2);
		}
		expect(guide).not.toMatch(/~~~thl (?:flow|bindings|binary|matrix|callstack)/);
	});
});


describe("compact player documentation contract (F09)", () => {
	const read = (path: string) => readFileSync(new URL("../../" + path, import.meta.url), "utf8");
	it("documents the actual named tabs and separate inspector controls", () => {
		const player = read("src/react/graph-player.tsx");
		const panel = read("src/react/inspect-panel.tsx");
		expect(player).toContain('role="tablist" aria-label="Visualization view"');
		expect(player).toContain('aria-label="Inspect" aria-pressed=');
		expect(player).toContain('aria-label="Workflow inspector"');
		expect(panel).toContain('<summary>Source details</summary>');
		expect(panel).toContain('<summary>Compare steps</summary>');
		for (const path of ["README.md", "docs/schema-v2.md", "docs/user-guide.md"]) {
			const doc = read(path);
			expect(doc).toMatch(/Source\s+details/);
			expect(doc).not.toMatch(/visible \*\*Explain \/ Inspect\*\* switch|manual \*\*Sequence\*\* option under Player options/);
		}
	});
	it("does not present the AT template as completed acceptance", () => {
		const qa = read("docs/qa/tl-u18-screen-reader-record.md");
		expect(qa).toContain("Evidence status: NOT PERFORMED");
		expect(qa).toContain("Workflow inspector");
		expect(qa).toContain("Source details");
		expect(qa).toContain("throughline.tgz");
		expect(qa).not.toContain("throughline-u18-candidate.tgz");
	});
});
