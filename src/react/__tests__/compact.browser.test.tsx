import { expect, it } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-react";
import { compile } from "../../domains/registry.js";
import { CHECKOUT_GUIDANCE, EXAMPLES } from "../../examples.js";
import { ThroughlinePlayer } from "../index.js";
import "../../styles/throughline.css";

const isBelow = (a: Element, b: Element) =>
	Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

it("uses compact borderless icon actions, square nodes and a bottom-only control area", async () => {
	const trace = compile(EXAMPLES.find((example) => example.id === "distributed-checkout")!.source);
	const screen = await render(<ThroughlinePlayer trace={trace} title="Review" guidance={CHECKOUT_GUIDANCE} />);
	const player = document.querySelector<HTMLElement>(".thl")!;
	const caption = player.querySelector(".thl-caption")!;
	const bottom = player.querySelector(".thl-bottom")!;
	const navigation = player.querySelector(".thl-viewport-tools")!;
	const playback = player.querySelector(".thl-controls")!;
	const chapter = screen.getByRole("combobox", { name: "Chapter" }).element();

	expect(isBelow(bottom, caption)).toBe(true);
	expect(bottom.contains(chapter)).toBe(true);
	expect(bottom.contains(navigation)).toBe(true);
	expect(bottom.contains(playback)).toBe(true);
	expect(getComputedStyle(player).paddingTop).toBe("24px");
	expect(getComputedStyle(player).borderTopLeftRadius).toBe("2px");
	expect(getComputedStyle(player.querySelector(".thl-viewport-tools button")!).borderTopWidth).toBe("0px");
	expect(getComputedStyle(screen.getByRole("button", { name: "Play", exact: true }).element()).borderTopWidth).toBe("0px");
	expect(getComputedStyle(screen.getByRole("combobox", { name: "Select entity" }).element()).borderTopLeftRadius).toBe("2px");
	expect(screen.getByRole("button", { name: "Zoom in" }).element().querySelector("svg")).not.toBeNull();
	expect(screen.getByRole("button", { name: "Zoom in" }).element().getBoundingClientRect().width).toBeGreaterThanOrEqual(34);
	for (const selector of [".thl-node", ".thl-group", ".thl-cell rect"]) {
		const node = player.querySelector<SVGRectElement>(selector)!;
		expect(node.getAttribute("rx"), selector).toBe("2");
	}
	await screen.getByRole("button", { name: "Restart chapter" }).click();
	await expect.element(screen.getByRole("slider", { name: "Timeline" })).toHaveAttribute("aria-valuetext", "Step 1 of 17");
});

it("sizes a mobile graph to its scene, without cropping or connector labels crossing nodes", async () => {
	await page.viewport(375, 900);
	const trace = compile(EXAMPLES.find((example) => example.id === "distributed-checkout")!.source);
	await render(<ThroughlinePlayer trace={trace} />);
	const player = document.querySelector<HTMLElement>(".thl")!;
	const svg = player.querySelector<SVGSVGElement>(".thl-scene")!;
	await expect.poll(() => svg.getAttribute("viewBox")?.split(" ")[2]).not.toBe("720");
	await expect.poll(() => Math.abs(svg.getBoundingClientRect().height - Number.parseFloat(svg.style.height))).toBeLessThan(1);
	const rect = svg.getBoundingClientRect();
	expect(rect.width).toBeLessThanOrEqual(player.clientWidth);
	expect(rect.height).toBeGreaterThan(112);
	expect(rect.height).toBeLessThanOrEqual(961);
	expect(player.scrollWidth).toBeLessThanOrEqual(player.clientWidth);
	const nodeBoxes = [...svg.querySelectorAll<SVGRectElement>(".thl-node")].map((node) => node.getBoundingClientRect());
	for (const label of svg.querySelectorAll<SVGTextElement>(".thl-edge-label")) {
		const rect = label.getBoundingClientRect();
		expect(nodeBoxes.some((box) =>
			rect.left < box.right && rect.right > box.left && rect.top < box.bottom && rect.bottom > box.top,
		), "Relation labels must not cover node values").toBe(false);
	}
});
