import { expect, it } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { compileProgram } from "../../compiler.js";
import { compile } from "../../domains/registry.js";
import { CHECKOUT_GUIDANCE, CHECKOUT_SCENARIOS } from "../../examples.js";
import { ThroughlinePlayer } from "../index.js";
import "../../styles/throughline.css";
import { openPlayerPanel, seekFrame } from "./player-actions.js";

const checkout = compile(CHECKOUT_SCENARIOS[2].source);
const pageTop = (element: Element) => element.getBoundingClientRect().top + window.scrollY;
const centerY = (element: Element) => {
	const rect = element.getBoundingClientRect();
	return rect.top + rect.height / 2;
};

it("uses the embed width to arrange chapter, viewport and playback controls", async () => {
	await page.viewport(1600, 900);
	const screen = await render(
		<div style={{ width: 1400 }}>
			<ThroughlinePlayer trace={checkout} title="Checkout recovery" guidance={CHECKOUT_GUIDANCE} />
		</div>,
	);
	const player = document.querySelector<HTMLElement>(".thl")!;
	const host = player.parentElement!;
	const scene = player.querySelector(".thl-scene")!;
	const bottom = player.querySelector(".thl-bottom")!;
	const chapter = screen.getByRole("combobox", { name: "Chapter" }).element();
	const play = screen.getByRole("button", { name: "Play", exact: true }).element();
	const zoom = screen.getByRole("button", { name: "Zoom in" }).element();
	const speed = screen.getByRole("combobox", { name: "Playback speed" }).element();
	const count = player.querySelector(".thl-step-count")!;
	expect(screen.getByRole("slider").query()).toBeNull();
	await screen.getByRole("combobox", { name: "Chapter" }).selectOptions("retry");
	await openPlayerPanel(screen, "View");
	await screen.getByRole("combobox", { name: "Select entity" }).selectOptions("worker");
	await screen.getByRole("button", { name: "View", exact: true }).click();
	for (const width of [1400, 768, 375, 300]) {
		host.style.width = width + "px";
		await expect.poll(() => player.getBoundingClientRect().width).toBe(width);
		expect(pageTop(chapter)).toBeLessThan(pageTop(scene));
		expect(pageTop(bottom)).toBeGreaterThan(pageTop(scene));
		expect(Math.abs(centerY(play) - centerY(count))).toBeLessThan(3);
		expect(player.querySelector(".thl-step-count-full")?.textContent).toBe("Step 10 of 17");
		expect(player.querySelector('[data-node="worker"] .thl-selected')).not.toBeNull();
		expect(player.scrollWidth).toBeLessThanOrEqual(player.clientWidth);
		if (width < 1400) {
			const chapterRow = chapter.closest(".thl-chapter-nav")!.getBoundingClientRect();
			const bounds = player.getBoundingClientRect();
			expect(chapterRow.left + chapterRow.width / 2).toBeCloseTo(bounds.left + bounds.width / 2, 0);
		}
		if (width >= 768) {
			expect(zoom.getBoundingClientRect().left).toBeGreaterThanOrEqual(scene.getBoundingClientRect().right);
			expect(Math.abs(centerY(play) - centerY(speed))).toBeLessThan(3);
		} else {
			expect(zoom.getBoundingClientRect().bottom).toBeLessThanOrEqual(scene.getBoundingClientRect().top);
			expect(zoom.getBoundingClientRect().width).toBeGreaterThanOrEqual(40);
			expect(chapter.getBoundingClientRect().height).toBeGreaterThanOrEqual(40);
			await expect.element(screen.getByText("10 / 17", { exact: true })).toBeVisible();
		}
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
	const barTop = pageTop(toolbar);
	const sceneBottom = scene.getBoundingClientRect().bottom + window.scrollY;
	expect(caption.open).toBe(false);
	expect(barTop).toBeGreaterThanOrEqual(sceneBottom - 1);
	expect(caption.getBoundingClientRect().top + window.scrollY).toBeGreaterThanOrEqual(barTop);

	await seekFrame(screen, 2);
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

	await seekFrame(screen, 3);
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
	const viewport = document.querySelector<HTMLElement>(".thl-viewport")!;
	const toolbar = document.querySelector<HTMLElement>(".thl-bottom")!;
	const titleGap = viewport.getBoundingClientRect().top - title.getBoundingClientRect().bottom;
	const controlsGap = toolbar.getBoundingClientRect().top - viewport.getBoundingClientRect().bottom;
	expect(titleGap).toBeGreaterThanOrEqual(10);
	expect(titleGap).toBeLessThanOrEqual(26);
	expect(controlsGap).toBeGreaterThanOrEqual(14);
	expect(controlsGap).toBeLessThanOrEqual(24);
	await screen.rerender(<ThroughlinePlayer trace={trace} />);
	expect(document.querySelector(".thl-title")).toBeNull();
	expect(document.querySelector(".thl-bottom")).not.toBeNull();
});
