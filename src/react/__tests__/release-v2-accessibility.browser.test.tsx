import { expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { EXAMPLES } from "../../examples.js";
import { compileArtifact } from "../../v2/compiler.js";
import { ThroughlineGraphPlayer } from "../graph-player.js";
import "../../styles/throughline.css";

/**
 * TL-U18 browser-matrix accessibility checks. These assert machine-readable
 * names, keyboard access and narrow-container usability in Chromium, Firefox
 * and WebKit. They do NOT claim to be a human screen-reader assessment.
 */
it("preserves labeled timeline navigation, explicit evidence and inspect controls at a 260px embed", async () => {
	const example = EXAMPLES.find(item => item.id === "factorial")!;
	const trace = compileArtifact(example.artifact);
	const screen = await render(
		<ThroughlineGraphPlayer trace={trace} title={example.title}
			initialView="graph" narration={false} />,
	);
	const player = screen.getByRole("group", { name: "Visualization player" });
	const element = player.element();
	expect(element.getAttribute("aria-keyshortcuts")).toContain("ArrowRight");
	expect(element.getAttribute("aria-describedby")).toBeTruthy();
	expect(document.getElementById(element.getAttribute("aria-describedby")!)?.textContent)
		.toContain("Left and Right arrows");
	await expect.element(screen.getByRole("heading", { name: example.title })).toBeVisible();
	await expect.element(screen.getByRole("img", {
		name: "Source-linked graph at current frame",
	})).toBeVisible();
	await expect.element(screen.getByRole("group", { name: "Playback controls" }))
		.toBeVisible();
	await expect.element(screen.getByRole("status")).toHaveTextContent(
		"Step 1 of " + trace.frames.length);

	element.style.width = "260px";
	element.style.maxWidth = "260px";
	expect(element.getBoundingClientRect().width).toBeLessThanOrEqual(261);
	expect(element.scrollWidth).toBeLessThanOrEqual(element.clientWidth + 2);
	const back = screen.getByRole("button", { name: "Step back" });
	expect(back.element().hasAttribute("disabled")).toBe(true);
	await screen.getByRole("button", { name: "Step forward" }).click();
	await expect.element(screen.getByRole("status")).toHaveTextContent(
		"Step 2 of " + trace.frames.length);
	element.focus();
	await userEvent.keyboard("{End}");
	await expect.element(screen.getByRole("status")).toHaveTextContent(
		"Step " + trace.frames.length + " of " + trace.frames.length);
	expect(screen.getByRole("button", { name: "Step forward" }).element().hasAttribute("disabled")).toBe(true);
	await userEvent.keyboard("{Home}");
	await expect.element(screen.getByRole("status")).toHaveTextContent(
		"Step 1 of " + trace.frames.length);
	await userEvent.keyboard("{ArrowRight}");
	await expect.element(screen.getByRole("status")).toHaveTextContent(
		"Step 2 of " + trace.frames.length);

	await screen.getByRole("button", { name: "Player options" }).click();
	await expect.element(screen.getByRole("dialog", { name: "Player options" })).toBeVisible();
	await screen.getByRole("button", { name: "Player options" }).click();
 await screen.getByRole("tab", { name: "State" }).click();
	await expect.element(screen.getByRole("region", { name: "State and event table" }))
		.toBeVisible();
	expect(document.querySelector(".thl-v2-state")?.textContent ??
		document.querySelector(".thl-v2-table")?.textContent ??
		document.body.textContent).toContain("Modeled call stack");
	await screen.getByRole("button", { name: "Inspect", exact: true }).click();
 await screen.getByText("Source details", { exact: true }).click();
 await expect.element(screen.getByRole("region", { name: "Evidence inspector" }))
		.toBeVisible();
	expect(element.scrollWidth).toBeLessThanOrEqual(element.clientWidth + 2);
	// The prototype's optional sound control is only mounted in Options.
 expect(document.querySelectorAll('button[aria-label="Sonify trace"]')).toHaveLength(0);
	expect(document.querySelectorAll('button[aria-label="Narrate captions"]')).toHaveLength(0);
}, 30_000);

it("keeps original source IDs and a readable state equivalent when views switch", async () => {
	const example = EXAMPLES.find(item => item.id === "checkout")!;
	const trace = compileArtifact(example.artifact);
	const screen = await render(<ThroughlineGraphPlayer trace={trace}
		initialView="sequence" narration={false}/>);
	await expect.element(screen.getByRole("region", {
		name: "Message sequence evidence", exact: true,
	})).toBeVisible();
	await screen.getByRole("button", { name: "Step forward" }).click();
	const event = example.artifact.steps[0].events[0];
	expect(document.querySelectorAll("[data-source-event-ids]").length).toBeGreaterThan(0);
	// A sent message cannot silently produce an acknowledged/processed phase.
	const correlation = document.querySelector("[data-message-id]");
	if (correlation) {
		expect(correlation.textContent).not.toContain("acknowledged: 1");
	}
	await screen.getByRole("tab", { name: "State" }).click();
	await expect.element(screen.getByRole("region", { name: "State and event table" }))
		.toBeVisible();
	expect(trace.frames[1].eventIds).toEqual(
		example.artifact.steps[0].events.map(item => item.id));
	expect(event.originId).toBeTruthy();
	await expect.element(screen.getByRole("status"))
		.toHaveTextContent("Step 2 of " + trace.frames.length);
}, 30_000);
