import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, readdirSync, rmSync, existsSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { chromium, firefox, webkit } from "@playwright/test";
import { build, preview } from "vite";
import { captureSource, sameSource } from "./mermaid-source-identity.mjs";
import { sampleProcessMemory } from "./mermaid-process-memory.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const before = captureSource(root);
const engine = process.env.THROUGHLINE_QA_BROWSER ?? "chromium";
const browserType = { chromium, firefox, webkit }[engine];
assert(browserType, "Unsupported packed proof browser");
const scratch = mkdtempSync(join(tmpdir(), "throughline-mermaid-packed-"));
const output = resolve(process.argv[2] ?? join(tmpdir(), "throughline-mermaid-packed-report.json"));
let browser, server, memory;
const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
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
	run("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund", "--package-lock",
		tarball, "react@" + installed("react"), "react-dom@" + installed("react-dom"), "mermaid@12.3.0"], consumer);
	run("node", ["--input-type=module", "-e", [
		'import assert from "node:assert/strict";',
		'import { compileArtifact } from "@0xbuff/throughline";',
		'import { EXAMPLES } from "@0xbuff/throughline/examples";',
		'assert.equal(compileArtifact(EXAMPLES[0].artifact).schemaVersion, 2);',
		'await assert.rejects(import("@0xbuff/throughline/dist/index.js"), error => error.code === "ERR_PACKAGE_PATH_NOT_EXPORTED");',
	].join("\n")], consumer);
	// This consumer deliberately resolves independently of the source pnpm lock.
	// Retain the actual npm lock plus installed manifests and license-file hashes
	// before building, including optional packages that were not installed.
	const lockBytes = readFileSync(join(consumer, "package-lock.json"));
	const lock = JSON.parse(lockBytes.toString("utf8"));
	const packages = Object.entries(lock.packages).filter(([path]) => path !== "").sort(([a], [b]) => a.localeCompare(b)).map(([path, resolved]) => {
		const directory = join(consumer, path), manifestPath = join(directory, "package.json");
		if (!existsSync(manifestPath)) {
			assert(resolved.optional, "Missing non-optional consumer package " + path);
			return { path, version: resolved.version, installed: false, optional: true };
		}
		const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
		assert.equal(manifest.version, resolved.version, "Installed version differs from lock: " + path);
		const licenses = readdirSync(directory).filter(file => /^(?:licen[cs]e|copying|notice|copyright)(?:[.\-_].*)?$/i.test(file)
			&& statSync(join(directory, file)).isFile()).sort().map(file => ({ file, sha256: sha256(readFileSync(join(directory, file))) }));
		return { path, name: manifest.name, version: manifest.version, installed: true,
			license: manifest.license ?? "UNDECLARED", licenses };
	});
	const inventory = { sourceSha: before.sourceSha, engine, resolution: "independent npm install; resolved transitives recorded, not assumed equal to source lock",
		npmVersion: run("npm", ["--version"], consumer).trim(), lockSha256: sha256(lockBytes), packages };
	const inventoryBytes = JSON.stringify(inventory, null, 2) + "\n";
	const lockName = "consumer-package-lock.json", inventoryName = "consumer-dependencies.json";
	writeFileSync(join(dirname(output), lockName), lockBytes);
	writeFileSync(join(dirname(output), inventoryName), inventoryBytes);
	const dependencyEvidence = { resolution: inventory.resolution, lockFile: lockName, lockSha256: inventory.lockSha256,
		inventoryFile: inventoryName, inventorySha256: sha256(inventoryBytes), npmVersion: inventory.npmVersion,
		installedPackages: packages.filter(entry => entry.installed).length };
	// Independently derive expected descriptors and exact cells from the
	// installed package, not from the candidate SVG or its host source list.
	const expectedReferences = JSON.parse(run("node", ["--input-type=module", "-e", [
		'import { compileArtifact, inspectTrace, projectView } from "@0xbuff/throughline";',
		'import { EXAMPLES } from "@0xbuff/throughline/examples";',
		'console.log(JSON.stringify(EXAMPLES.map(example => {',
		' const trace = compileArtifact(example.artifact), inspector = inspectTrace(trace);',
		' const graph = projectView(inspector, {kind:"graph",frameIndex:1});',
		' const entity = graph.items.find(item => item.role === "entity");',
		' if (!entity) throw Error("Reference has no entity at frame one");',
		' const sequence = projectView(inspector, {kind:"sequence",frameIndex:1});',
		' return { id:example.id, title:example.title, itemId:entity.id, source:entity.source, label:entity.label,',
		' cells:entity.source.entityIds.map(id=>({id,cell:inspector.valueAt(1,id)})),',
		' sequenceKind:sequence.kind, diagnostics:sequence.diagnostics ?? [],',
		' eventSources:sequence.items.filter(item=>item.role==="event").map(item=>item.source) };',
		'})));',
	].join("\n")], consumer));
	mkdirSync(join(consumer, "proof"));
	// Copy the actual test host/adapter, changing import boundaries only. Runtime
	// model, query, examples and player imports resolve to the installed tarball.
	for (const name of ["adapter.ts", "diagram.tsx", "render.ts", "motion.ts", "evidence.tsx", "sequence-layout.ts", "value-summary.ts"]) {
		const directory = ["sequence-layout.ts", "value-summary.ts"].includes(name) ? "src/v2"
			: name.endsWith(".tsx") ? "src/react/__tests__/mermaid-proof" : "src/react/mermaid";
		const original = readFileSync(join(root, directory, name), "utf8");
		const copied = original.replace(/"\.\.\/(?:\.\.\/)+v2\/model\.js"/g, '"@0xbuff/throughline"')
			.replaceAll('"../../mermaid/', '"./');
		writeFileSync(join(consumer, "proof", name), copied
			.replace('"../../v2/sequence-layout.js"', '"./sequence-layout.js"')
			.replace('"../../v2/value-summary.js"', '"./value-summary.js"')
			.replace('"./model.js"', '"@0xbuff/throughline"'));
	}
	let host = readFileSync(join(root, "scripts/mermaid-proof.tsx"), "utf8");
	for (const [source, target] of [
		["../src/examples.js", "@0xbuff/throughline/examples"],
		["../src/v2/compiler.js", "@0xbuff/throughline"], ["../src/v2/inspector.js", "@0xbuff/throughline"],
		["../src/v2/views.js", "@0xbuff/throughline"], ["../src/react/graph-player.js", "@0xbuff/throughline/react"],
		["../src/styles/throughline.css", "@0xbuff/throughline/styles/throughline.css"],
		["../src/react/__tests__/mermaid-proof/", "./proof/"],
		["../src/react/mermaid/", "./proof/"],
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
	const executablePath = engine === "webkit" ? process.env.THROUGHLINE_QA_WEBKIT_EXECUTABLE : undefined;
	memory = sampleProcessMemory();
	browser = await browserType.launch(executablePath ? { executablePath } : {});
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
	const caption = diagram.locator("[data-thl-source-reference][role=button]");
	assert.equal(await caption.count(), 1, "Packed sequence has no unique source reference");
	await caption.click();
	const selectedSource = page.getByRole("region", { name: "Selected exact source" });
	await selectedSource.waitFor();
	assert.deepEqual(JSON.parse(await selectedSource.locator("[data-proof-source]").textContent()).eventIds, ["requestSent"]);
	await selectedSource.getByRole("button", { name: "Clear selection" }).click();
	await caption.focus();
	await page.keyboard.press("Enter");
	await selectedSource.waitFor();
	assert.deepEqual(JSON.parse(await selectedSource.locator("[data-proof-source]").textContent()).eventIds, ["requestSent"]);
	await selectedSource.getByRole("button", { name: "Clear selection" }).click();
	await page.getByText("Complete evidence at selected frame", { exact: true }).click();
	await page.getByRole("button", { name: "requestSent", exact: true }).click();
	assert((await page.getByRole("region", { name: "Selected exact source" }).textContent()).includes("requestSent"));
	const responsive = [];
	for (const width of [260, 320, 375, 720]) {
		await page.setViewportSize({ width, height: 812 });
		const geometry = await page.evaluate(async () => {
			// Wait for the resized document and native controls to lay out.
			await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
			const viewport = innerWidth, rootWidth = document.documentElement.scrollWidth;
			const bounds = node => {
				const rect = node.getBoundingClientRect();
				return { tag: node.tagName, className: node.getAttribute("class") ?? "", left: rect.left, right: rect.right, width: rect.width, scrollWidth: node.scrollWidth };
			};
			const controls = [...document.querySelectorAll(".proof-controls select, .proof-frame-control input")].map(bounds);
			const outside = [...document.querySelectorAll("main *")].filter(node =>
				node instanceof HTMLElement && node.getBoundingClientRect().width > 0 &&
				(node.getBoundingClientRect().left < -1 || node.getBoundingClientRect().right > viewport + 1))
				.slice(0, 40).map(bounds);
			return { viewport, rootWidth, controls, outside };
		});
		responsive.push({ width, ...geometry });
		const controlsFit = geometry.controls.length === 4 && geometry.controls.every(control =>
			[control.left, control.right, control.width].every(Number.isFinite) &&
			control.width > 0 && control.left >= 0 && control.right <= geometry.viewport);
		if (geometry.rootWidth > geometry.viewport || !controlsFit) {
			// Preserve a failure for review instead of just emitting a boolean.
			writeFileSync(join(dirname(output), "packed-layout-failure.json"), JSON.stringify({ sourceSha: before.sourceSha, engine, responsive }, null, 2) + "\n");
			await page.screenshot({ path: join(dirname(output), "packed-layout-failure.png"), fullPage: true });
		}
		assert(geometry.rootWidth <= geometry.viewport, "Host overflows at " + width + ": " + JSON.stringify(geometry));
		assert(controlsFit, "Host controls exceed viewport at " + width + ": " + JSON.stringify(geometry.controls));
	}
	assert.deepEqual(errors, []); assert.deepEqual(nonLocal, []);
	const sequenceAssets = [...requested].filter(file => !initialAssets.includes(file));
	// The proof host includes all four canonical references. Exercise their
	// graph sources and the honest non-message fallback separately from checkout.
	const referenceResults = [];
	const examples = page.locator("select").nth(0);
	const options = await examples.locator("option").evaluateAll(nodes =>
		nodes.map(node => ({ value: node.value, title: node.textContent })));
	assert.equal(options.length, 4);
	for (const { value, title } of options) {
		await examples.selectOption(value);
		await page.waitForFunction(() => document.querySelector("output")?.textContent?.startsWith("0:"));
		await page.locator("select").nth(1).selectOption("graph");
		await page.locator('[data-proof-kind="graph"] svg').waitFor({ state: "attached", timeout: 60_000 });
		const initialNodes = await diagram.locator("[data-thl-item-id]").count();
		assert(initialNodes > 0, "Missing mapped graph sources");
		await page.getByRole("button", { name: "Next frame", exact: true }).click();
		await page.waitForFunction(() => document.querySelector("output")?.textContent?.startsWith("1:"));
		await page.locator('[data-proof-kind="graph"] svg').waitFor({ state: "attached", timeout: 60_000 });
		const expected = expectedReferences[Number(value)];
		assert.equal(title, expected.title);
		const panel = page.getByRole("region", { name: "Selected exact source" });
		const clear = async () => {
			if (await panel.isVisible()) await panel.getByRole("button", { name: "Clear selection" }).click();
			await panel.waitFor({ state: "hidden" });
		};
		const verify = async () => {
			await panel.waitFor({ state: "visible" });
			assert.deepEqual(JSON.parse(await panel.locator("[data-proof-source]").textContent()), expected.source);
			assert.equal(await panel.getByRole("heading").textContent(), expected.label);
			for (const { id, cell } of expected.cells)
				assert.deepEqual(JSON.parse(await panel.locator('[data-proof-cell="' + id + '"]').textContent()), cell);
		};
		const mark = diagram.locator('[data-thl-item-id="' + expected.itemId + '"][role="button"]');
		assert.equal(await mark.count(), 1, "Missing or duplicate rendered entity");
		// Compare the inline slot against the installed core's independently
		// queried cell, using the native summary contract rather than SVG text.
		const cell = expected.cells[0].cell;
		let expectedSummary;
		if (cell.status === "unknown") expectedSummary = "Unknown";
		else if (cell.status === "absent") expectedSummary = "Absent";
		else {
			const value = cell.value;
			if (Array.isArray(value)) expectedSummary = value.length + (value.length === 1 ? " item" : " items");
			else if (value !== null && typeof value === "object") {
				const count = Object.keys(value).length;
				expectedSummary = count + (count === 1 ? " field" : " fields");
			} else {
				const bounded = typeof value === "string" && value.length > 46 ? value.slice(0, 45).replace(/[\uD800-\uDBFF]$/, "") + "…" : value;
				const text = JSON.stringify(bounded);
				expectedSummary = text.length > 48 ? text.slice(0, 47) + "…" : text;
			}
		}
		assert.equal(await mark.locator("[data-thl-state-label]").textContent(), expectedSummary, "Inline Graph value differs from installed core");
		await clear(); await mark.click(); await verify();
		await clear(); await mark.focus();
		assert(await mark.evaluate(node => document.activeElement === node), "SVG mark did not receive keyboard focus");
		await page.keyboard.press("Enter"); await verify();
		await clear();
		const exact = page.locator('[aria-label="Exact diagram sources"] button[data-source-item="' + expected.itemId + '"]');
		await exact.click(); await verify();
		let noMessageFallback = null;
		if (expected.sequenceKind === "state-table") {
			await page.locator("select").nth(1).selectOption("sequence");
			await page.getByText(expected.diagnostics.join(" "), { exact: true }).waitFor();
			assert.equal(await page.locator('[data-proof-kind="sequence"]').count(), 0,
				"Non-message reference produced a fabricated sequence");
			const evidence = page.getByRole("region", { name: "Complete recorded evidence" });
			await evidence.waitFor({ state: "visible" });
			const rows = evidence.locator("tbody tr");
			assert.equal(await rows.count(), Math.min(40, expected.eventSources.length));
			if (expected.eventSources.length) {
				const first = expected.eventSources[0];
				await clear();
				await rows.first().getByRole("button").click();
				await panel.waitFor({ state: "visible" });
				assert.deepEqual(JSON.parse(await panel.locator("[data-proof-source]").textContent()), first);
			}
			noMessageFallback = { diagnostic: expected.diagnostics, eventCount: expected.eventSources.length };
		}
		referenceResults.push({ exampleIndex: Number(value), id: expected.id, title, initialNodes,
			expectedSource: expected.source, expectedCells: expected.cells, inlineState: expectedSummary, svgPointer: true, svgKeyboard: true, list: true, noMessageFallback });
	}
	assert.deepEqual(errors, []); assert.deepEqual(nonLocal, []);
	const after = captureSource(root);
	const report = { sourceSha: before.sourceSha, dirty: Boolean(before.status), sourceStable: sameSource(before, after),
		inputFingerprint: before.fingerprint, mermaid: "12.3.0", engine, browser: browser.version(),
		referenceResults, sequenceCaptionPointer: true, sequenceCaptionKeyboard: true, responsive, dependencyEvidence,
		archiveSha256: createHash("sha256").update(readFileSync(tarball)).digest("hex"),
		initialAssets, sequenceAssets,
		processMemory: memory.stop(), assets, errors, nonLocal, packedCore: true, proofHostBuild: true, candidateBrowser: true, productionMermaid: false };
	writeFileSync(output, JSON.stringify(report, null, 2) + "\n");
	assert(report.sourceStable, "Source changed during packed-candidate verification");
	console.log("Packed native package + copied Mermaid feasibility adapter passed; NOT a production Mermaid cutover: " + output);
	console.log("TL_U26_PACKED_PROCESS_MEMORY " + JSON.stringify(report.processMemory));
} finally {
	memory?.stop();
	await browser?.close();
	if (server) await new Promise(resolve => server.httpServer.close(resolve));
	rmSync(scratch, { recursive: true, force: true });
}
