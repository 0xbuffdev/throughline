import assert from "node:assert/strict";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, expect } from "@playwright/test";
import { preview } from "vite";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
assert(existsSync(join(root, "playground/dist/index.html")), "Build first with pnpm preview:build");
const output = join(root, ".release-evidence/player-design");
mkdirSync(output, { recursive: true });

let server;
let browser;
let context;
const images = [];
const errors = [];

const slug = value => value.replace(/[^a-z0-9_-]+/gi, "-").toLowerCase().replace(/^-|-$/g, "");
const capture = async (page, name, { fullPage = false } = {}) => {
	const filename = slug(name) + ".png";
	const target = fullPage ? page.locator(".pdr-app") : page.locator(".pdr-host");
	await expect(target).toBeVisible();
	const metrics = await target.evaluate(element => ({
		width: Math.round(element.getBoundingClientRect().width),
		clientWidth: element.clientWidth,
		scrollWidth: element.scrollWidth,
		clientHeight: element.clientHeight,
		scrollHeight: element.scrollHeight,
	}));
	await target.screenshot({ path: join(output, filename), animations: "disabled" });
	images.push({ file: filename, name, metrics });
};

try {
	server = await preview({
		configFile: join(root, "playground/vite.config.ts"),
		preview: { host: "127.0.0.1", port: 0, strictPort: false },
		logLevel: "error",
	});
	const port = server.httpServer.address()?.port;
	assert.equal(typeof port, "number");
	browser = await chromium.launch();
	context = await browser.newContext({
		viewport: { width: 1540, height: 1000 },
		reducedMotion: "reduce",
		deviceScaleFactor: 1,
		colorScheme: "light",
	});
	const page = await context.newPage();
	page.on("pageerror", error => errors.push(error.message));
	page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
	await page.goto("http://127.0.0.1:" + port + "/?player-lab=1", { waitUntil: "networkidle" });
	await expect(page.getByRole("heading", { name: "Build the right player." })).toBeVisible();
	const refSelect = page.getByRole("combobox", { name: "Player review reference" });
	const widthSelect = page.getByRole("combobox", { name: "Player review width" });
	const themeSelect = page.getByRole("combobox", { name: "Player review theme" });
	const viewSelect = page.getByRole("combobox", { name: "Player review initial view" });
	const variantSelect = page.getByRole("combobox", { name: "Player review fixture" });
	const references = await refSelect.locator("option").evaluateAll(options =>
		options.map(option => ({ id: option.value, title: option.textContent })));
	assert.equal(references.length, 4, "The four accepted first-party references must be available.");

	// Current real production player: four checked references across responsive
	// host widths and themes. It is a baseline, not a claim of visual quality.
	for (const reference of references) {
		await refSelect.selectOption(reference.id);
		await variantSelect.selectOption("reference");
		await viewSelect.selectOption("graph");
		for (const theme of ["light", "dark"]) {
			await themeSelect.selectOption(theme);
			for (const width of [260, 320, 375, 768, 1280]) {
				await widthSelect.selectOption(String(width));
				const player = page.getByRole("group", { name: "Visualization player" });
				await expect(player).toBeVisible();
				await capture(page, "live-" + reference.id + "-" + theme + "-" + width);
			}
		}
	}

	// Long labels, the current missing-title fallback, and invalid source
	// are explicit comparison subjects rather than hidden reviewer assumptions.
	await refSelect.selectOption(references[0].id);
	await themeSelect.selectOption("light");
	await widthSelect.selectOption("260");
	await variantSelect.selectOption("long");
	await capture(page, "live-long-labels-260");
	await variantSelect.selectOption("untitled");
	await capture(page, "live-no-title-260");
	await variantSelect.selectOption("invalid");
	await expect(page.getByText("Artifact not rendered")).toBeVisible();
	assert.equal(await page.getByRole("group", { name: "Visualization player" }).count(), 0);
	await capture(page, "invalid-rejected-260");

	// Interactions must use native controls; do not alter compiled frames to
	// fabricate a middle/final state or guess evidence.
	await variantSelect.selectOption("reference");
	await widthSelect.selectOption("375");
	await viewSelect.selectOption("graph");
	const player = page.getByRole("group", { name: "Visualization player" });
	await expect(player).toBeVisible();
	await capture(page, "live-initial-frame-375");
	await player.getByRole("button", { name: "Step forward" }).click();
	await player.getByRole("button", { name: "Step forward" }).click();
	await capture(page, "live-middle-frame-375");
	await player.focus();
	await player.press("End");
	await capture(page, "live-final-frame-375");
	const node = player.locator("[data-node]").first();
	if (await node.count()) {
		await node.click();
		await capture(page, "live-selected-entity-375");
	}
	await player.getByRole("button", { name: "Inspect", exact: true }).click();
	await capture(page, "live-inspect-open-375");
	await viewSelect.selectOption("state-table");
	await capture(page, "live-state-table-375");
	await refSelect.selectOption(references[3].id);
	await viewSelect.selectOption("sequence");
	await capture(page, "live-sequence-checkout-375");

	// Layout study contains intentionally static geometry, not a disguised
	// or invented real player. Always label it separately in the evidence.
	await page.getByRole("button", { name: "Layout study" }).click();
	await widthSelect.selectOption("260");
	await capture(page, "proposal-static-anatomy-light-260");
	await themeSelect.selectOption("dark");
	await widthSelect.selectOption("1280");
	await capture(page, "proposal-static-anatomy-dark-1280");

	assert.deepEqual(errors, [], "Public design review emitted browser errors");
	const manifest = {
		kind: "TL-P01 unapproved real-browser visual baseline",
		sourceSha: process.env.THL_SOURCE_SHA || "local-unspecified",
		runId: process.env.GITHUB_RUN_ID || "local",
		browser: "Chromium " + browser.version(),
		deviceScaleFactor: 1,
		browserViewport: { width: 1540, height: 1000 },
		colorScheme: "light",
		reducedMotion: "reduce",
		referenceIds: references.map(value => value.id),
		hostWidths: [260, 320, 375, 768, 1280],
		themeModes: ["light", "dark"],
		notes: "Screenshots are native source renders except files starting proposal-static; quality/AT and baseline approval remain human decisions.",
		images,
	};
	writeFileSync(join(output, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
	console.log("Captured " + images.length + " real-browser TL-P01 review images to " + output);
} finally {
	await context?.close();
	await browser?.close();
	if (server) await new Promise((resolve, reject) =>
		server.httpServer.close(error => error ? reject(error) : resolve()));
}
