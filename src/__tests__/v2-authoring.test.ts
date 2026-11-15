import { describe, expect, it } from "vitest";
import {
	artifactRelativePath, artifactSha256, parseIntentBlock, parseThlBody,
	resolveThlBody, sha256Text, validateSidecarManifest,
	type SidecarManifest, type VisualArtifact,
} from "../index.js";

export const counter = (): VisualArtifact => ({
	schemaVersion: 2, id: "counter",
	origins: [{ id: "author", kind: "authored" }],
	entities: [{ id: "counter", label: "Counter" }], relations: [],
	initialState: { counter: { status: "known", value: 0 } },
	steps: [{ id: "one", label: "Increment", events: [
		{ id: "update", originId: "author", type: "write", entityId: "counter",
			path: [], value: { status: "known", value: 1 } },
	] }],
});
export const inline = () => JSON.stringify(counter());
export const intent = "Explain the counter.\r\nShow its explicit writes. ";
export const manifestFor = (
	body = intent, artifact = counter(), review: "reviewed" | "unreviewed" = "reviewed",
): SidecarManifest => ({
	version: 1,
	entries: [{
		document: "lessons/counter.mdx", ordinal: 0,
		intentSha256: sha256Text(body.replace(/\r\n?/g, "\n")),
		artifactPath: "traces/counter.json",
		artifactSha256: artifactSha256(artifact),
		review,
	}],
});

describe("TL-U08 — one universal authoring contract", () => {
	it("matches known SHA-256 vectors and Unicode UTF-8, in pure JS", () => {
		expect(sha256Text("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
		expect(sha256Text("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
		expect(sha256Text("hello 🌍")).toBe("92de6bbfa52e6cfa0f85916fd8176cb1644b95a4c0148cdda94745ba6c35e5eb");
	});

	it("normalizes line endings but preserves other intent whitespace and makes no inference", () => {
		expect(parseIntentBlock(intent)).toEqual({ body: "Explain the counter.\nShow its explicit writes. " });
		expect(parseThlBody(intent)).toEqual({ kind: "intent", value: parseIntentBlock(intent) });
		expect(() => parseIntentBlock(" \r\n\t ")).toThrow(/THL_EMPTY/);
		expect(() => parseIntentBlock("x".repeat(262_145))).toThrow(/THL_INTENT_LIMIT/);
		expect(() => parseIntentBlock("{ }")).toThrow(/THL_SYNTAX/);
		expect(() => parseThlBody("\ud800")).toThrow(/THL_UNICODE/);
		expect(() => parseThlBody("\udc00")).toThrow(/THL_UNICODE/);
	});

	it("accepts exact strict schema-2 JSON offline without a manifest or provider", () => {
		const parsed = parseThlBody("\r\n  " + inline());
		expect(parsed.kind).toBe("artifact");
		expect(resolveThlBody(inline())).toMatchObject(counter());
		expect(Object.isFrozen(resolveThlBody(inline()))).toBe(true);
		expect(() => parseThlBody('{"schemaVersion":2,"schemaVersion":2}'))
			.toThrow(/duplicate object key/);
		expect(() => parseThlBody('{"schemaVersion":2, BAD')).toThrow();
		expect(() => parseThlBody('{"documentVersion":1,"artifact":{}}'))
			.toThrow(/THL_UNSUPPORTED_DOCUMENT/);
		expect(() => parseThlBody('{"schemaVersion":1}')).toThrow(/unsupported artifact schema/);
		expect(() => parseThlBody(" \n ")).toThrow(/THL_EMPTY/);
	});

	it("refuses unreviewed and stale materializations without invoking a provider", () => {
		const source = intent;
		const loadArtifact = (path: string) => {
			expect(path).toBe("traces/counter.json");
			return inline();
		};
		const options = { document: "lessons/counter.mdx", ordinal: 0, loadArtifact };
		expect(resolveThlBody(source, { ...options, manifest: manifestFor() }))
			.toEqual(resolveThlBody(inline()));
		expect(() => resolveThlBody(source, options)).toThrow(/THL_UNRESOLVED/);
		expect(() => resolveThlBody(source, { ...options, manifest: manifestFor(source, counter(), "unreviewed") }))
			.toThrow(/THL_UNREVIEWED/);
		expect(() => resolveThlBody(source + " changed", { ...options, manifest: manifestFor() }))
			.toThrow(/THL_DIGEST/);
		expect(() => resolveThlBody(source, { ...options, manifest: manifestFor(),
			loadArtifact: () => JSON.stringify({ ...counter(), id: "changed" }) }))
			.toThrow(/THL_DIGEST/);
		expect(() => resolveThlBody(source, { ...options, manifest: manifestFor(), ordinal: 1 }))
			.toThrow(/THL_UNRESOLVED/);
	});

	it("rejects traversal, encoded path aliases, duplicate locators and getters", () => {
		for (const path of ["../a.md", "/root/a.md", "a//b", "a/./b", "C:/a", "a\\b", "a/%2e%2e/b", "a/%2f/b", "a/\0b"]) {
			expect(() => artifactRelativePath(path)).toThrow(/THL_PATH/);
		}
		expect(artifactRelativePath("lessons/valid-file.mdx")).toBe("lessons/valid-file.mdx");
		const original = manifestFor();
		expect(() => validateSidecarManifest({
			version: 1, entries: [original.entries[0], original.entries[0]],
		})).toThrow(/duplicate/);
		expect(() => validateSidecarManifest({ version: 2, entries: [] })).toThrow(/version/);
		expect(() => validateSidecarManifest({ version: 1, entries: [{ ...original.entries[0],
			get artifactPath() { throw new Error("getter executed"); },
		}] })).toThrow(/THL_MANIFEST/);
		expect(() => validateSidecarManifest({ version: 1, entries: [{ ...original.entries[0],
			artifactPath: "a/../secret.json",
		}] })).toThrow(/THL_PATH/);
	});

	it("cannot use an existing reviewed artifact to mask changed model semantics", () => {
		const altered = counter();
		altered.steps[0].events.push({
			id: "conflict", originId: "author", type: "write",
			entityId: "counter", path: [], value: { status: "known", value: 2 },
		});
		expect(() => resolveThlBody(JSON.stringify(altered))).toThrow();
	});
});
