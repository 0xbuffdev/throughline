import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { captureSource, sameSource } from "./mermaid-source-identity.mjs";

test("evidence rejects changed source content and commits instead of relabeling measurements", () => {
	const cwd = mkdtempSync(join(tmpdir(), "throughline-source-evidence-"));
	const git = (...args) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: "pipe" });
	try {
		git("init"); git("config", "user.name", "Throughline test fixture");
		git("config", "user.email", "fixture@example.invalid");
		mkdirSync(join(cwd, "src"));
		const file = join(cwd, "src", "input.ts");
		writeFileSync(file, "export const value = 1;\n"); git("add", "."); git("commit", "-m", "fixture");
		const before = captureSource(cwd);
		assert.equal(before.status, ""); assert(sameSource(before, captureSource(cwd)));
		writeFileSync(file, "export const value = 2;\n");
		const dirty = captureSource(cwd); assert(!sameSource(before, dirty));
		writeFileSync(file, "export const value = 3;\n");
		const stillDirty = captureSource(cwd);
		assert.equal(stillDirty.status, dirty.status);
		assert(!sameSource(dirty, stillDirty), "Same dirty filename must not hide changed input bytes");
		git("add", "."); git("commit", "-m", "updated fixture");
		const after = captureSource(cwd); assert.equal(after.status, "");
		assert.notEqual(after.sourceSha, before.sourceSha);
		assert(!sameSource(before, after), "A new clean commit must not be stamped onto old measurements");
	} finally { rmSync(cwd, { recursive: true, force: true }); }
});
