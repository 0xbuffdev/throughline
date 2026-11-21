import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { chromium } from "@playwright/test";
import { build, preview } from "vite";
import { captureSource, sameSource } from "./mermaid-source-identity.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const before = captureSource(root);
const scratch = mkdtempSync(join(tmpdir(), "throughline-mermaid-packed-"));
const output = resolve(process.argv[2] ?? join(tmpdir(), "throughline-mermaid-packed-report.json"));
let browser, server;
function run(command, args, cwd) {
	const result = spawnSync(command, args, { cwd, encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
	if (result.error || result.status !== 0) throw new Error(command + " failed:\n" + result.stdout + "\n" + result.stderr);
	return result.stdout;
}

try {
	const tarball = join(scratch, "throughline.tgz"), consumer = join(scratch, "consumer");
	run("pnpm", ["pack", "--out", tarball], root); mkdirSync(consumer);
	writeFileSync(join(consumer, "package.json"), JSON.stringify({ name: "independent-mermaid-proof", private: true, type: "module" }));
	const installed = name => JSON.parse(readFileSync(join(root, "node_modules", name, "package.json"), "utf8")).version;
	run("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund", "--no-package-lock",
		tarball, "react@" + installed("react"), "react-dom@" + installed("react-dom"), "mermaid@12.3.0"], consumer);
	run("node", ["--input-type=module", "-e", [
		'import assert from "node:assert/strict";',
		'import { compileArtifact } from "@0xbuff/throughline";',
		'import { EXAMPLES } from "@0xbuff/throughline/examples";',
		'assert.equal(compileArtifact(EXAMPLES[0].artifact).schemaVersion, 2);',
		'await assert.rejects(import("@0xbuff/throughline/dist/index.js"), error => error.code === "ERR_PACKAGE_PATH_NOT_EXPORTED");',
	].join("\n")], consumer);
	mkdirSync(join(consumer, "proof"));
	// Copy the actual test host/adapter, changing import boundaries only. Runtime
	// model, query, examples and player imports resolve to the installed tarball.
	for (const name of ["adapter.ts", "diagram.tsx", "render.ts", "motion.ts", "evidence.tsx"]) {
		const original = readFileSync(join(root, "src/react/__tests__/mermaid-proof", name), "utf8");
		const copied = original.replace('"../../../v2/model.js"', '"@0xbuff/throughline"');
		writeFileSync(join(consumer, "proof", name), copied);
	}
	let host = readFileSync(join(root, "scripts/mermaid-proof.tsx"), "utf8");
	for (const [source, target] of [
		["../src/examples.js", "@0xbuff/throughline/examples"],
		["../src/v2/compiler.js", "@0xbuff/throughline"], ["../src/v2/inspector.js", "@0xbuff/throughline"],
		["../src/v2/views.js", "@0xbuff/throughline"], ["../src/react/graph-player.js", "@0xbuff/throughline/react"],
		["../src/styles/throughline.css", "@0xbuff/throughline/styles/throughline.css"],
		["../src/react/__tests__/mermaid-proof/", "./proof/"],
	]) host = host.replaceAll(source, target);
	assert(!host.includes("../src/"), "Host still imports source checkout");
	writeFileSync(join(consumer, "app.tsx"), host);
	writeFileSync(join(consumer, "index.html"), readFileSync(join(root, "scripts/mermaid-proof.html"), "utf8")
		.replace("./mermaid-proof.tsx", "./app.tsx"));
	await build({ configFile: false, envFile: false, root: consumer, logLevel: "error",
		build: { outDir: "dist", emptyOutDir: true, sourcemap: false } });
	const distribution = join(consumer, "dist");
	const assets = readdirSync(distribution, { recursive: true }).filter(file => /\.(?:js|css)$/.test(file)).map(file => {
		const data = readFileSync(join(distribution, file));
		return { file, bytes: data.length, gzipBytes: gzipSync(data).length,
			sha256: createHash("sha256").update(data).digest("hex") };
	});
	server = await preview({ configFile: false, envFile: false, root: consumer, logLevel: "error",
		build: { outDir: "dist" }, preview: { host: "127.0.0.1", port: 0, strictPort: false } });
	const base = "http://127.0.0.1:" + server.httpServer.address().port;
	browser = await chromium.launch();
	const page = await browser.newPage({ viewport: { width: 375, height: 812 }, reducedMotion: "reduce" });
	const errors = [], nonLocal = [], requested = new Set();
	page.on("pageerror", error => errors.push(error.message));
	page.on("response", response => {
		const url = new URL(response.url());
		if (/\.(?:js|css)$/.test(url.pathname)) requested.add(url.pathname.slice(1));
	});
	await page.route("**/*", route => {
		if (new URL(route.request().url()).origin === base) return route.continue();
		nonLocal.push(route.request().url()); return route.abort();
	});
	await page.goto(base, { waitUntil: "domcontentloaded" });
	const diagram = page.getByRole("group", { name: "Candidate diagram" });
	await diagram.waitFor({ timeout: 60_000 });
	const initialAssets = [...requested];
	await page.evaluate(() => { window.__INITIAL_CANDIDATE = document.querySelector('[aria-label="Candidate diagram"] svg'); });
	await page.getByRole("button", { name: "Next frame", exact: true }).click();
	await page.waitForFunction(() => document.querySelector("output")?.textContent?.startsWith("1:"));
	assert(await page.evaluate(() => document.querySelector('[aria-label="Candidate diagram"] svg') === window.__INITIAL_CANDIDATE),
		"Packed candidate rerendered geometry on an ordinary step");
	await page.getByRole("button", { name: "Previous frame", exact: true }).click();
	await page.locator("select").nth(1).selectOption("sequence");
	await page.locator('[data-proof-kind="sequence"]').waitFor();
	assert.equal(await diagram.locator("[data-thl-motion-item]").count(), 0, "Initial sequence contains fabricated arrow");
	await page.getByRole("button", { name: "Next frame", exact: true }).click();
	await diagram.locator("[data-thl-motion-item]").waitFor({ state: "attached" });
	assert.equal(await diagram.locator("[data-thl-motion-item]").count(), 1);
	assert.notEqual(await diagram.locator("[data-thl-motion-item]").evaluate(node => getComputedStyle(node).stroke), "none",
		"Packed sequence arrow has no painted stroke");
	await page.getByText("Complete evidence at selected frame", { exact: true }).click();
	await page.getByRole("button", { name: "requestSent", exact: true }).click();
	assert((await page.getByRole("region", { name: "Selected exact source" }).textContent()).includes("requestSent"));
	for (const width of [260, 320, 375, 720]) {
		await page.setViewportSize({ width, height: 812 });
		assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "Host overflows at " + width);
	}
	assert.deepEqual(errors, []); assert.deepEqual(nonLocal, []);
	const after = captureSource(root);
	const report = { sourceSha: before.sourceSha, dirty: Boolean(before.status), sourceStable: sameSource(before, after),
		inputFingerprint: before.fingerprint, mermaid: "12.3.0", browser: browser.version(),
		archiveSha256: createHash("sha256").update(readFileSync(tarball)).digest("hex"),
		initialAssets, sequenceAssets: [...requested].filter(file => !initialAssets.includes(file)),
		assets, errors, nonLocal, packedCore: true, productionBuild: true, candidateBrowser: true };
	writeFileSync(output, JSON.stringify(report, null, 2) + "\n");
	assert(report.sourceStable, "Source changed during packed-candidate verification");
	console.log("Packed production Mermaid candidate passed; asset/source evidence: " + output);
} finally {
	await browser?.close();
	if (server) await new Promise(resolve => server.httpServer.close(resolve));
	rmSync(scratch, { recursive: true, force: true });
}
