/**
 * Called *only after* the full Vitest browser suite exits successfully.
 * This is a run-attestation, not a simulated screen-reader/manual test.
 */
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { arch, cpus, platform, release } from "node:os";
import { join } from "node:path";
const browser = process.argv[2] ?? "chromium";
assert(["chromium", "firefox", "webkit"].includes(browser), "unsupported browser name");
const sha = process.env.THL_SOURCE_SHA;
assert(sha && /^[0-9a-f]{40}$/.test(sha), "exact source SHA is required");
assert.match(process.env.GITHUB_RUN_ID ?? "", /^[1-9][0-9]*$/, "browser evidence requires a CI run");
assert.match(process.env.GITHUB_RUN_ATTEMPT ?? "", /^[1-9][0-9]*$/, "browser evidence requires a CI attempt");
const result = {
	ticket: "TL-U18",
	status: "pass",
	scope: "automated browser regressions only",
	browser,
	sourceCommit: sha,
	workflowRun: process.env.GITHUB_RUN_ID,
	workflowAttempt: process.env.GITHUB_RUN_ATTEMPT,
	workflowJob: process.env.GITHUB_JOB ?? "unknown",
	testCommand: "pnpm test:browser:run",
	includes: [
		"schema-2 graph/sequence/state-table and Explain/Inspect",
		"keyboard operation and named accessible controls",
		"260px player container and source-linked live region",
		"reduced motion and optional audio opt-in",
		"SSR-safe player behavior and deterministic source provenance",
	],
	notEstablished: [
		"manual NVDA/JAWS/VoiceOver/TalkBack assessment",
		"native browser 200%/400% zoom and real assistive-technology speech",
		"real-world comprehension superiority",
	],
	runner: { node: process.version, os: platform(), osRelease: release(),
		arch: arch(), cpu: cpus()[0]?.model ?? "unknown" },
};
const folder = join(process.cwd(), ".release-evidence");
mkdirSync(folder, { recursive: true });
const output = join(folder, "v2-browser-" + browser + ".json");
writeFileSync(output, JSON.stringify(result, null, 2) + "\n");
console.info("TL_U18_BROWSER " + JSON.stringify(result));
