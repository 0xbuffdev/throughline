import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, expect } from "@playwright/test";
import { preview } from "vite";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const built = join(root, "playground", "studio", "dist", "index.html");
assert(existsSync(built), "Build the public site first: pnpm studio:build");

let server;
let browser;
let context;
try {
	server = await preview({
		configFile: join(root, "playground", "studio", "vite.config.ts"),
		preview: { host: "127.0.0.1", port: 0, strictPort: false },
		logLevel: "error",
	});
	const port = server.httpServer.address()?.port;
	assert.equal(typeof port, "number", "Preview server must bind a local port");
	browser = await chromium.launch();
	context = await browser.newContext({
		viewport: { width: 1400, height: 900 },
		reducedMotion: "reduce",
		acceptDownloads: true,
	});
	const page = await context.newPage();
	const errors = [];
	const externalRequests = [];
	await context.route("**/*", route => {
		if (new URL(route.request().url()).origin === "http://127.0.0.1:" + port) return route.continue();
		externalRequests.push(route.request().url());
		return route.abort();
	});
	page.on("pageerror", error => errors.push(error.message));
	page.on("console", message => {
		if (message.type() === "error") errors.push(message.text());
	});
	await page.goto("http://127.0.0.1:" + port, { waitUntil: "networkidle" });
	await expect(page).toHaveTitle(/Throughline Playground/);
	await expect(page.getByRole("heading", { name: "Make state visible." })).toBeVisible();
	const editor = page.getByRole("textbox", { name: "Throughline schema-2 JSON" });
	await expect(editor).toBeVisible();
	await expect(page.locator(".diagnostic-success")).toBeVisible();
	await expect(page.getByRole("group", { name: "Visualization player" })).toBeVisible();

	// Real source changes go through the strict compiler; prose is not executable.
	await editor.fill("Explain factorial(4) in a graph.");
	await expect(page.getByRole("group", { name: "Visualization player" })).toHaveCount(0);
	await expect(page.locator(".diagnostic-intent")).toBeVisible();
	await expect(page.getByRole("group", { name: "Visualization player" })).toHaveCount(0);
	await editor.fill('{"schemaVersion":2,');
	await expect(page.locator(".diagnostic-error")).toBeVisible();
	await expect(page.getByRole("group", { name: "Visualization player" })).toHaveCount(0);

	page.once("dialog", dialog => dialog.accept());
	await page.getByRole("button", { name: "New trace" }).click();
	await expect(page.locator(".diagnostic-success")).toBeVisible();
	await expect(page.getByRole("group", { name: "Visualization player" })).toBeVisible();
	const downloaded = page.waitForEvent("download");
	await page.getByRole("button", { name: "Export" }).click();
	const file = await downloaded;
	assert.equal(file.suggestedFilename(), "my_first_trace.json");

	// The public site must be usable at phone width without desktop overflow.
	await page.setViewportSize({ width: 375, height: 820 });
	await expect(page.getByRole("button", { name: "Preview", exact: true })).toBeVisible();
	await page.getByRole("button", { name: "Preview", exact: true }).click();
	await expect(page.getByRole("group", { name: "Visualization player" })).toBeVisible();
	const dimensions = await page.evaluate(() => ({
		viewport: innerWidth, documentWidth: document.documentElement.scrollWidth,
	}));
	assert(dimensions.documentWidth <= dimensions.viewport + 2,
		"Public playground overflows at mobile width: " + JSON.stringify(dimensions));
	await page.getByRole("button", { name: "Editor", exact: true }).click();
	await expect(editor).toBeVisible();
	await page.getByRole("combobox", { name: "Appearance" }).selectOption("dark");
	await expect(page.locator(".studio-app[data-theme='dark']")).toBeVisible();
	assert.deepEqual(externalRequests, [], "Authoring must not request remote resources");
	assert.deepEqual(errors, [], "Built public playground emitted browser errors");
	console.log("Public schema-2 playground passed built-site editor, diagnostics, preview, export, mobile and theme smoke tests.");
} finally {
	await context?.close();
	await browser?.close();
	if (server) await new Promise((resolve, reject) =>
		server.httpServer.close(error => error ? reject(error) : resolve()));
}
