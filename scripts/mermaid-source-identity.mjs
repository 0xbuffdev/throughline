import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";

export function captureSource(cwd = process.cwd()) {
	const git = (...args) => execFileSync("git", args, { cwd, encoding: "utf8" });
	const sourceSha = git("rev-parse", "HEAD").trim();
	const status = git("status", "--porcelain", "--untracked-files=all");
	const files = git("ls-files", "-z", "src", "scripts", "package.json", "pnpm-lock.yaml")
		.split("\0").filter(Boolean).sort();
	const hash = createHash("sha256");
	for (const file of files) { hash.update(file + "\0"); hash.update(readFileSync(resolve(cwd, file))); hash.update("\0"); }
	return Object.freeze({ sourceSha, status, fingerprint: hash.digest("hex") });
}

export function sameSource(before, after) {
	return before.sourceSha === after.sourceSha && before.status === after.status && before.fingerprint === after.fingerprint;
}
