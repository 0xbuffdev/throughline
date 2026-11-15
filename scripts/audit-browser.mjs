import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { createServer } from "vite";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const scratch = mkdtempSync(join(tmpdir(), "throughline-v2-browser-consumer-"));
let browser, context, server;

function run(command, args, cwd) {
	const result = spawnSync(command, args, {
		cwd, encoding: "utf8", maxBuffer: 8 * 1024 * 1024,
	});
	if (result.error || result.status !== 0)
		throw new Error([command, ...args].join(" ") + " failed:\n" +
			(result.stdout ?? "") + "\n" + (result.stderr ?? "") +
			(result.error ? "\n" + result.error.message : ""));
	return result.stdout;
}

// This fixture imports only publicly packed schema-2 artifacts and entrypoints.
const traceSource = [
	'import { EXAMPLES } from "@0xbuff/throughline/examples";',
	'import { compileArtifact } from "@0xbuff/throughline";',
	'const artifact = EXAMPLES.find(item => item.id === "factorial").artifact;',
	'const trace = compileArtifact(artifact);',
].join("\n");

try {
	const tarball = join(scratch, "throughline.tgz");
	run("pnpm", ["pack", "--out", tarball], root);
	const consumer = join(scratch, "consumer");
	mkdirSync(consumer);
	writeFileSync(join(consumer, "package.json"),
		JSON.stringify({ name: "independent-throughline-v2-browser", private: true, type: "module" }));
	run("npm", ["install", "--no-audit", "--no-fund", "--no-package-lock",
		"--ignore-scripts", tarball, "react@^19", "react-dom@^19"], consumer);
	run("node", ["--input-type=module", "-e", [
		'import assert from "node:assert/strict";',
		'await assert.rejects(import("@0xbuff/throughline/dist/index.js"),',
		'  error => error.code === "ERR_PACKAGE_PATH_NOT_EXPORTED");',
		'import * as root from "@0xbuff/throughline";',
		'import * as react from "@0xbuff/throughline/react";',
		'assert.equal("compile" in root, false);',
		'assert.equal("ThroughlinePlayer" in react, false);',
	].join("\n")], consumer);
	const markup = run("node", ["--input-type=module", "-e", [
		'import { createElement } from "react";',
		'import { renderToString } from "react-dom/server";',
		'import { ThroughlineGraphPlayer } from "@0xbuff/throughline/react";',
		traceSource,
		'process.stdout.write(renderToString(createElement(ThroughlineGraphPlayer, { trace, initialView: "graph" })));',
	].join("\n")], consumer);
	assert.match(markup, /Visualization player/, "SSR native schema-2 player not present");
	writeFileSync(join(consumer, "index.html"), [
		"<!doctype html><html lang=\"en\"><head><meta charset=\"UTF-8\">",
		"<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"></head><body>",
		'<div id="root">' + markup + "</div>",
		'<script>window.__SERVER_NODE = document.querySelector("#root > .thl");</script>',
		'<script type="module" src="/main.js"></script>',
		"</body></html>",
	].join("\n"));
	writeFileSync(join(consumer, "main.js"), [
		'import { createElement, useEffect } from "react";',
		'import { hydrateRoot } from "react-dom/client";',
		'import { ThroughlineGraphPlayer } from "@0xbuff/throughline/react";',
		'import "@0xbuff/throughline/styles/throughline.css";',
		traceSource,
		'function App() {',
		'  useEffect(() => { window.__HYDRATED = true; }, []);',
		'  return createElement(ThroughlineGraphPlayer, { trace, initialView: "graph" });',
		'}',
		'hydrateRoot(document.getElementById("root"), createElement(App));',
	].join("\n"));

	server = await createServer({
		configFile: false, envFile: false, root: consumer, logLevel: "error",
		mode: "development",
		server: { host: "127.0.0.1", port: 0, strictPort: false },
	});
	await server.listen();
	const port = server.httpServer?.address()?.port;
	assert.equal(typeof port, "number");

	browser = await chromium.launch();
	context = await browser.newContext({
		viewport: { width: 375, height: 850 },
		reducedMotion: "reduce", hasTouch: true,
	});
	const page = await context.newPage();
	const errors = [];
	page.on("pageerror", error => errors.push(error.message));
	page.on("console", message => {
		if (message.type() === "error") errors.push(message.text());
	});
	await page.goto("http://127.0.0.1:" + port + "/", { waitUntil: "networkidle" });
	await page.waitForFunction(() => window.__HYDRATED === true, null, { timeout: 15_000 });
	assert(await page.evaluate(() =>
		document.querySelector("#root > .thl") === window.__SERVER_NODE),
		"React replaced rather than hydrated native server player");
	const player = page.getByRole("group", { name: "Visualization player" });
	assert(await player.isVisible());
	assert.match(await page.getByRole("status").textContent(), /Step 1 of 9/);
	const visual = await player.evaluate(element => ({
		overflow: element.scrollWidth > element.clientWidth,
		radius: getComputedStyle(element).getPropertyValue("--thl-radius").trim(),
		controls: getComputedStyle(element.querySelector(".thl-bottom")).display,
		graph: element.querySelector(".thl-v2-diagram") !== null,
		reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
	}));
	assert.equal(visual.overflow, false, "Native schema-2 player overflows phone viewport");
	assert.equal(visual.radius, "0.125rem", "Packed CSS tokens not loaded");
	assert(visual.controls && visual.controls !== "none", "Controls not displayed");
	assert.equal(visual.graph, true, "Native graph not rendered");
	assert.equal(visual.reducedMotion, true);
	await page.getByRole("button", { name: "Step forward" }).click();
	assert.match(await page.getByRole("status").textContent(), /Step 2 of 9/);
	await player.focus();
	await page.keyboard.press("ArrowRight");
	assert.match(await page.getByRole("status").textContent(), /Step 3 of 9/);
	await page.getByRole("button", { name: "Player options" }).tap();
	await page.getByRole("combobox", { name: "Visualization view" }).selectOption("state-table");
	assert(await page.getByRole("region", { name: "State and event table" }).isVisible());
	const state = await page.getByRole("region", { name: "State and event table" }).textContent();
	assert.match(state, /Modeled call stack/);
	assert.deepEqual(errors, [], "Browser hydration/console failures occurred");
	console.log("Packed v2 browser consumer passed SSR hydration, mobile CSS, keyboard, touch, state-table and public-export gates.");
} finally {
	await context?.close();
	await browser?.close();
	await server?.close();
	rmSync(scratch, { recursive: true, force: true });
}
