import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { createServer } from "vite";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const scratch = mkdtempSync(join(tmpdir(), "throughline-vite-consumer-"));
let browser;
let server;
let context;

function run(command, args, cwd) {
	const result = spawnSync(command, args, {
		cwd,
		encoding: "utf8",
		maxBuffer: 8 * 1024 * 1024,
	});
	if (result.error || result.status !== 0) {
		throw new Error(
			[command, ...args].join(" ") +
				" failed:\n" +
				(result.stdout ?? "") +
				"\n" +
				(result.stderr ?? "") +
				(result.error ? "\n" + result.error.message : ""),
		);
	}
	return result.stdout;
}

// This fixture intentionally imports only the packed package by its public exports.
const traceSource = [
	'const fence = String.fromCharCode(96).repeat(3);',
	'const source = [fence + "thl flow", "node n \\"Number\\" = 0",',
	'  "step \\"One\\"", " set n = 1", "step \\"Two\\"", " set n = 2", fence].join("\\n");',
	'const trace = compile(source);',
].join("\n");

try {
	const tarball = join(scratch, "throughline.tgz");
	run("pnpm", ["pack", "--out", tarball], root);

	const consumer = join(scratch, "consumer");
	mkdirSync(consumer);
	writeFileSync(
		join(consumer, "package.json"),
		JSON.stringify({ name: "independent-throughline-vite", private: true, type: "module" }),
	);
	run(
		"npm",
		[
			"install",
			"--no-audit",
			"--no-fund",
			"--no-package-lock",
			"--ignore-scripts",
			tarball,
			"react@^19",
			"react-dom@^19",
		],
		consumer,
	);

	// Node must reject unsupported deep imports even when dist files exist.
	run(
		"node",
		[
			"--input-type=module",
			"-e",
			[
				'import assert from "node:assert/strict";',
				'await assert.rejects(',
				'  import("@0xbuff/throughline/dist/index.js"),',
				'  (error) => error.code === "ERR_PACKAGE_PATH_NOT_EXPORTED",',
				');',
			].join("\n"),
		],
		consumer,
	);

	// Generate actual server markup from the installed tarball, not source modules.
	const markup = run(
		"node",
		[
			"--input-type=module",
			"-e",
			[
				'import { createElement } from "react";',
				'import { renderToString } from "react-dom/server";',
				'import { compile } from "@0xbuff/throughline";',
				'import { ThroughlinePlayer } from "@0xbuff/throughline/react";',
				traceSource,
				'process.stdout.write(renderToString(createElement(ThroughlinePlayer, { trace })));',
			].join("\n"),
		],
		consumer,
	);
	assert(markup.includes("Visualization player"), "Server did not render the player");
	writeFileSync(
		join(consumer, "index.html"),
		[
			"<!doctype html>",
			'<html lang="en"><head><meta charset="UTF-8">',
			'<meta name="viewport" content="width=device-width,initial-scale=1"></head><body>',
			'<div id="root">' + markup + "</div>",
			'<script>window.__SERVER_NODE = document.querySelector("#root > .thl");</script>',
			'<script type="module" src="/main.js"></script>',
			"</body></html>",
		].join("\n"),
	);
	writeFileSync(
		join(consumer, "main.js"),
		[
			'import { createElement, useEffect } from "react";',
			'import { hydrateRoot } from "react-dom/client";',
			'import { compile } from "@0xbuff/throughline";',
			'import { ThroughlinePlayer } from "@0xbuff/throughline/react";',
			'import "@0xbuff/throughline/styles/throughline.css";',
			traceSource,
			'function App() {',
			'  useEffect(() => { window.__HYDRATED = true; }, []);',
			'  return createElement(ThroughlinePlayer, { trace });',
			'}',
			'hydrateRoot(document.getElementById("root"), createElement(App));',
		].join("\n"),
	);

	server = await createServer({
		configFile: false,
		envFile: false,
		root: consumer,
		logLevel: "error",
		mode: "development",
		server: { host: "127.0.0.1", port: 0, strictPort: false },
	});
	await server.listen();
	const port = server.httpServer?.address()?.port;
	assert.equal(typeof port, "number", "Vite did not select a port");

	browser = await chromium.launch();
	context = await browser.newContext({
		viewport: { width: 375, height: 850 },
		reducedMotion: "reduce",
		hasTouch: true,
	});
	const page = await context.newPage();
	const errors = [];
	page.on("pageerror", (error) => errors.push(error.message));
	page.on("console", (message) => {
		if (message.type() === "error") errors.push(message.text());
	});
	await page.goto("http://127.0.0.1:" + port + "/", { waitUntil: "networkidle" });
	await page.waitForFunction(() => window.__HYDRATED === true, null, { timeout: 15_000 });

	assert(
		await page.evaluate(
			() => document.querySelector("#root > .thl") === window.__SERVER_NODE,
		),
		"React replaced rather than hydrated the server player node",
	);
	const player = page.getByRole("group", { name: "Visualization player" });
	assert(await player.isVisible(), "Hydrated player is not visible");
	assert.match(await page.getByRole("status").textContent(), /Step 1 of 3/);

	const visual = await player.evaluate((element) => ({
		overflow: element.scrollWidth > element.clientWidth,
		border: getComputedStyle(element).borderTopWidth,
		radiusToken: getComputedStyle(element).getPropertyValue("--thl-radius").trim(),
		controls: getComputedStyle(element.querySelector(".thl-controls")).display,
		captionBorder: getComputedStyle(element.querySelector(".thl-caption")).borderTopWidth,
		reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
	}));
	assert.equal(visual.overflow, false, "Player overflows at phone width");
	assert.equal(visual.radiusToken, "0.125rem", "Packed player must preserve compact corner-radius tokens");
	assert.equal(visual.border, "0px", "The player must not have an outer border");
	assert.equal(visual.captionBorder, "0px", "The caption must remain borderless");
	assert.equal(visual.controls, "grid", "Package control-bar styles did not load");
	assert.equal(visual.reducedMotion, true, "Reduced-motion media preference absent");

	await page.getByRole("button", { name: "Step forward" }).click();
	assert.match(await page.getByRole("status").textContent(), /Step 2 of 3/);
	await player.focus();
	await page.keyboard.press("ArrowRight");
	assert.match(await page.getByRole("status").textContent(), /Step 3 of 3/);

	// Use a real Chromium touch-enabled context, not a synthetic input event.
	assert.equal(await page.getByRole("slider").count(), 0, "Player must be slider-free");
	await page.getByRole("button", { name: "Player options" }).tap();
	await page.getByRole("spinbutton", { name: "Step number" }).fill("1");
	await page.getByRole("button", { name: "Go to step" }).tap();
	assert.match(await page.getByRole("status").textContent(), /Step 1 of 3/);
	// Exercise the native fullscreen layout in a real Chromium document.
	const options = page.getByRole("button", { name: "Player options" });
	await options.tap();
	await page.getByRole("button", { name: "Maximize player" }).tap();
	await page.waitForFunction(() => document.fullscreenElement?.classList.contains("thl"));

	const fullscreenBounds = () => player.evaluate((element) => {
		const header = element.querySelector(".thl-header").getBoundingClientRect();
		const svg = element.querySelector(".thl-scene");
		const scene = svg.getBoundingClientRect();
		const bar = element.querySelector(".thl-bottom").getBoundingClientRect();
		const caption = element.querySelector(".thl-caption").getBoundingClientRect();
		const { x, y, width, height } = svg.viewBox.baseVal;
		const center = new DOMPoint(x + width / 2, y + height / 2).matrixTransform(svg.getScreenCTM());
		const padding = Number.parseFloat(getComputedStyle(element).paddingBottom);
		return {
			width: element.clientWidth,
			height: element.clientHeight,
			scrollHeight: element.scrollHeight,
			windowWidth: innerWidth,
			windowHeight: innerHeight,
			headerTop: header.top,
			sceneHeight: scene.height,
			sceneBottom: scene.bottom,
			centerX: center.x,
			centerY: center.y,
			sceneCenterY: scene.top + scene.height / 2,
			barTop: bar.top,
			captionBottom: caption.bottom,
			padding,
		};
	});
	const closed = await fullscreenBounds();
	assert.equal(closed.width, closed.windowWidth, "Fullscreen should fill the browser width");
	assert.equal(closed.height, closed.windowHeight, "Fullscreen should fill the browser height");
	assert.equal(closed.scrollHeight, closed.height, "Fullscreen should fit without page scrolling");
	assert.equal(closed.headerTop, closed.padding, "Header should sit at the top");
	assert.equal(closed.captionBottom, closed.height - closed.padding, "Caption should sit at the bottom");
	assert(closed.sceneHeight > closed.height / 2, "Scene should fill the available height");
	assert(closed.sceneBottom <= closed.barTop, "Scene should fit above the controls");
	assert(Math.abs(closed.centerX - closed.width / 2) < 1, "Diagram should be centered horizontally");
	assert(Math.abs(closed.centerY - closed.sceneCenterY) < 1, "Diagram should be centered vertically");

	await page.getByText("Details", { exact: true }).tap();
	const expanded = await fullscreenBounds();
	assert(expanded.barTop < closed.barTop, "Expanded details should move the controls up");
	assert(expanded.sceneHeight < closed.sceneHeight, "Expanded details should shrink the scene");
	assert.equal(expanded.headerTop, closed.headerTop, "Expanded details should keep the header in place");
	assert.equal(expanded.captionBottom, closed.captionBottom, "Expanded details should grow above the bottom edge");

	await options.tap();
	await page.getByRole("button", { name: "Minimize player" }).tap();
	await page.waitForFunction(() => document.fullscreenElement === null);

	assert.deepEqual(errors, [], "Hydration or browser console errors were emitted");

	console.log("Packed Vite React consumer passed SSR hydration, CSS, keyboard, touch step navigation, fullscreen, mobile and export checks.");
} finally {
	await context?.close();
	await browser?.close();
	await server?.close();
	rmSync(scratch, { recursive: true, force: true });
}
