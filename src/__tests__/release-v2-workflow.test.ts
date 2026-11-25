import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

it("TL-U18 keeps tagged-release verification and stage archive separate from quality evidence", () => {
	const publish = read(".github/workflows/publish.yml");
	const ci = read(".github/workflows/ci.yml");
	const qa = read(".github/workflows/release-qa-browsers.yml");
	const pkg = JSON.parse(read("package.json")) as {
		exports: Record<string, unknown>; bin?: Record<string, string>; version: string;
	};
	expect(Object.keys(pkg.exports).sort()).toEqual([
		".", "./examples", "./node", "./react", "./remark", "./styles/throughline.css",
	].sort());
	expect(pkg.bin?.thl).toBe("./dist/cli/main.js");
	expect(pkg.version).toMatch(/^(0|[1-9][0-9]*)[.](0|[1-9][0-9]*)[.](0|[1-9][0-9]*)$/);
	expect(publish).toContain("workflow_dispatch:");
	expect(publish).toContain("Checkout exact tag without persistent credentials");
	expect(publish).toContain("Verify signed annotated tag on main using GitHub API");
	expect(publish).toContain("THL_SOURCE_SHA=$(git rev-parse HEAD)");
	expect(publish).toContain("node scripts/verify-release-evidence.mjs");
	expect(publish).toContain("npm stage publish");
	expect(publish).not.toContain("npm publish --");
	expect(publish).toContain("id-token: write");
	const releaseUpload = publish.split("- name: Upload immutable release review artifact")[1]!
		.split("\n  authorize:")[0];
	expect(releaseUpload).toContain("release-artifacts/throughline.tgz");
	expect(releaseUpload).toContain("release-artifacts/SHA256SUMS");
	expect(releaseUpload).toContain("release-artifacts/RELEASE_COMMIT");
	expect(releaseUpload).not.toContain(".release-evidence/");
	expect(publish).toContain("name: throughline-quality-");
	expect(publish).toContain("name: throughline-release-browsers-");
	expect(publish).toContain("needs: authorize");
	expect(publish).toContain("node scripts/release-candidate-gate.mjs authorize");
	expect(publish).toContain("scripts/audit-mermaid-production.mjs");
	expect(publish).toContain("THL_RELEASE_TARBALL");
	expect(publish).toContain("APPROVED_SHA256");
	expect(publish).toContain("verifyReleaseVersion(pkg.version, process.env.RELEASE_TAG)");
	expect(publish).toContain("Download raw quality records from the same prepare attempt");
	expect(publish).toContain("Download raw browser records from the same prepare attempt");
	const stage = publish.split("\n  stage:")[1]!;
	expect(stage).toContain("run-id: " + "$" + "{{ inputs.candidate_run }}");
	expect(stage).not.toContain("pnpm pack");
	expect(stage).toContain("environment: npm-publish");
	expect(stage).toContain("needs: authorize");
	expect(publish.split("\n  authorize:")[0]).not.toContain("id-token: write");
	expect(ci).toContain("node scripts/verify-release-evidence.mjs");
	expect(ci).toContain("throughline-v2-quality-");
	expect(ci).toContain("throughline-v2-chromium-");
	expect(qa).toContain("throughline-v2-" + "$" + "{{ matrix.browser }}-");
	expect(qa).toContain("browser: [firefox, webkit]");
});
