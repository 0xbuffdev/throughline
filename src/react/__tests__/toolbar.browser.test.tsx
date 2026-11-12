import { expect, it } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { compileProgram } from "../../compiler.js";
import { compile } from "../../domains/registry.js";
import { CHECKOUT_GUIDANCE, CHECKOUT_SCENARIOS } from "../../examples.js";
import { ThroughlinePlayer } from "../index.js";
import "../../styles/throughline.css";

const checkout = compile(CHECKOUT_SCENARIOS[2].source);
const pageTop = (element: Element) => element.getBoundingClientRect().top + window.scrollY;
const centerY = (element: Element) => {
	const rect = element.getBoundingClientRect();
	return rect.top + rect.height / 2;
};

it("forms one aligned compact toolbar on wide screens and adapts by container width", async () => {
	await page.viewport(1600, 900);
	const screen = await render(<ThroughlinePlayer trace={checkout} guidance={CHECKOUT_GUIDANCE} />);
	const player = document.querySelector<HTMLElement>(".thl")!;
	const bottom = player.querySelector<HTMLElement>(".thl-bottom")!;
	const chapter = screen.getByRole("combobox", { name: "Chapter" }).element();
	const entity = screen.getByRole("combobox", { name: "Select entity" }).element();
	const play = screen.getByRole("button", { name: "Play", exact: true }).element();
	const zoom = screen.getByRole("button", { name: "Zoom in" }).element();
	const timeline = screen.getByRole("slider", { name: "Timeline" }).element();
	expect(Math.abs(centerY(chapter) - centerY(entity))).toBeLessThan(3);
	expect(Math.abs(centerY(chapter) - centerY(play))).toBeLessThan(3);
	expect(Math.abs(centerY(chapter) - centerY(timeline))).toBeLessThan(3);
	expect(bottom.getBoundingClientRect().height).toBeLessThan(55);
	expect(zoom.getBoundingClientRect().width).toBe(34);
	expect(getComputedStyle(zoom.querySelector("svg")!).width).toBe("14px");
	expect(chapter.getBoundingClientRect().height).toBe(34);
	expect(getComputedStyle(chapter).borderTopLeftRadius).toBe("2px");
	expect(getComputedStyle(chapter).paddingLeft).toBe("8px");

	await page.viewport(960, 850);
	await expect.poll(() => player.getBoundingClientRect().width).toBeLessThan(1000);
	expect(pageTop(bottom)).toBeGreaterThan(pageTop(player.querySelector(".thl-scene")!));
	expect(centerY(play)).toBeGreaterThan(centerY(chapter));
	expect(player.scrollWidth).toBeLessThanOrEqual(player.clientWidth);

	await page.viewport(375, 850);
	await expect.poll(() => player.getBoundingClientRect().width).toBeLessThan(400);
	expect(zoom.getBoundingClientRect().width).toBe(40);
	expect(chapter.getBoundingClientRect().height).toBeGreaterThanOrEqual(40);
	expect(entity.getBoundingClientRect().height).toBeGreaterThanOrEqual(40);
	expect(bottom.getBoundingClientRect().height).toBeLessThan(210);
	expect(player.scrollWidth).toBeLessThanOrEqual(player.clientWidth);
	const bounds = bottom.getBoundingClientRect();
	for (const element of bottom.querySelectorAll<HTMLElement>("button, select, input")) {
		const rect = element.getBoundingClientRect();
		expect(rect.left, element.getAttribute("aria-label") ?? element.tagName).toBeGreaterThanOrEqual(bounds.left - 1);
		expect(rect.right, element.getAttribute("aria-label") ?? element.tagName).toBeLessThanOrEqual(bounds.right + 1);
	}
});

it("keeps transport next to the diagram while long authored details change and expand", async () => {
	await page.viewport(375, 850);
	const longNote = "An authored workflow observation remains available as a full explanation. ".repeat(48);
	const trace = compileProgram({
		version: 1,
		entities: [{ id: "server", label: "Server", value: "waiting" }],
		relations: [],
		beats: [
			{ label: "Start", events: [{ op: "set", target: "server", value: "processing" }, { op: "note", text: "Short note." }] },
			{ label: "Long explanation", events: [{ op: "note", text: longNote }] },
			{ label: "Complete", events: [{ op: "set", target: "server", value: "done" }, { op: "note", text: "Done." }] },
		],
	});
	const screen = await render(<ThroughlinePlayer trace={trace} />);
	const player = document.querySelector<HTMLElement>(".thl")!;
	const scene = player.querySelector<SVGSVGElement>(".thl-scene")!;
	const toolbar = player.querySelector<HTMLElement>(".thl-bottom")!;
	const caption = player.querySelector<HTMLDetailsElement>(".thl-caption")!;
	const body = player.querySelector<HTMLElement>(".thl-caption-content")!;
	const timeline = screen.getByRole("slider", { name: "Timeline" });
	const barTop = pageTop(toolbar);
	const sceneBottom = scene.getBoundingClientRect().bottom + window.scrollY;
	expect(caption.open).toBe(false);
	expect(barTop).toBeGreaterThanOrEqual(sceneBottom - 1);
	expect(caption.getBoundingClientRect().top + window.scrollY).toBeGreaterThanOrEqual(barTop);

	await timeline.fill("2");
	expect(caption.open).toBe(false);
	expect(player.querySelector(".thl-caption-teaser")?.textContent).toBe(longNote);
	expect(pageTop(toolbar)).toBeCloseTo(barTop, 0);
	expect(caption.getBoundingClientRect().height).toBeLessThan(65);

	await screen.getByText("Details", { exact: true }).click();
	expect(caption.open).toBe(true);
	await expect.element(screen.getByText(longNote, { exact: true }).last()).toBeVisible();
	expect(body.scrollHeight).toBeGreaterThan(body.clientHeight);
	expect(body.getBoundingClientRect().height).toBeLessThanOrEqual(193);
	expect(pageTop(toolbar)).toBeCloseTo(barTop, 0);

	await timeline.fill("3");
	expect(caption.open).toBe(true);
	expect(pageTop(toolbar)).toBeCloseTo(barTop, 0);
	await screen.getByText("Details", { exact: true }).click();
	expect(caption.open).toBe(false);
});

it("keeps native keyboard disclosure and detailed state inspection accessible", async () => {
	const trace = compile('thl flow\nnode a "Accumulator" = [1,2]\nstep "Update"\n  set a = [1,2,3]\n  note "New item appended"');
	const screen = await render(<ThroughlinePlayer trace={trace} />);
	const details = document.querySelector<HTMLDetailsElement>(".thl-caption")!;
	const summary = details.querySelector("summary")!;
	expect(details.open).toBe(false);
	summary.focus();
	await userEvent.keyboard("{Enter}");
	expect(details.open).toBe(true);
	await screen.getByText("Inspect state").click();
	expect(screen.getByText("[1,2]", { exact: true })).toBeInTheDocument();
	await screen.getByRole("button", { name: "Step forward" }).click();
	expect(details.open).toBe(true);
	expect(screen.getByRole("status").element().textContent).toContain("Step 2 of 2");
	summary.focus();
	await userEvent.keyboard("{Enter}");
	expect(details.open).toBe(false);
});

it("keeps a modest visible gap between an optional title, the scene and its control bar", async () => {
	const trace = compile(CHECKOUT_SCENARIOS[2].source);
	const screen = await render(<ThroughlinePlayer title="Checkout workflow" trace={trace} />);
	const title = document.querySelector<HTMLElement>(".thl-title")!;
	const scene = document.querySelector<SVGSVGElement>(".thl-scene")!;
	const toolbar = document.querySelector<HTMLElement>(".thl-bottom")!;
	const titleGap = scene.getBoundingClientRect().top - title.getBoundingClientRect().bottom;
	const controlsGap = toolbar.getBoundingClientRect().top - scene.getBoundingClientRect().bottom;
	expect(titleGap).toBeGreaterThanOrEqual(10);
	expect(titleGap).toBeLessThanOrEqual(16);
	expect(controlsGap).toBeGreaterThanOrEqual(14);
	expect(controlsGap).toBeLessThanOrEqual(24);
	await screen.rerender(<ThroughlinePlayer trace={trace} />);
	expect(document.querySelector(".thl-title")).toBeNull();
	expect(document.querySelector(".thl-bottom")).not.toBeNull();
});
