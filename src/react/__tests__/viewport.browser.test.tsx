import { expect, it } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { compile } from "../../domains/registry.js";
import { ThroughlinePlayer } from "../index.js";
import "../../styles/throughline.css";

const source = [
	"```thl flow",
	'node a "Alpha" = {"value":1}',
	'node b "Beta" = {"value":2}',
	'link ab a -> b',
	'step "Focus Alpha"',
	'  focus a',
	'step "Focus Beta"',
	'  focus b',
	'step "Finish"',
	'  focus a',
	"```",
].join("\n");

const view = (): number[] =>
	document.querySelector(".thl-scene")!.getAttribute("viewBox")!.split(" ").map(Number);

it("keeps overview until following is enabled and gives manual actions precedence", async () => {
	const trace = compile(source);
	const screen = await render(<ThroughlinePlayer trace={trace} />);
	// The initial 720px SSR fallback becomes the measured host width when
	// ResizeObserver fires; only compare camera behavior after that settles.
	await expect.poll(() => view()[2]).toBeLessThan(720);
	const original = view();
	const follow = screen.getByRole("button", { name: "Follow active entity" });
	await screen.getByRole("button", { name: "Step forward" }).click();
	expect(view()).toEqual(original);
	await follow.click();
	await expect.element(follow).toHaveAttribute("aria-pressed", "true");
	const atAlpha = view();
	await screen.getByRole("button", { name: "Step forward" }).click();
	expect(view()).not.toEqual(atAlpha);
	await screen.getByRole("button", { name: "Zoom in" }).click();
	await expect.element(follow).toHaveAttribute("aria-pressed", "false");
	const manual = view();
	await screen.getByRole("button", { name: "Step forward" }).click();
	expect(view()).toEqual(manual);
	await screen.getByRole("button", { name: "Fit to view" }).click();
	expect(view()).toEqual(original);
});

it("supports keyboard pan and zoom on the scene while the player still owns stepping", async () => {
	const screen = await render(<ThroughlinePlayer trace={compile(source)} />);
	const svg = document.querySelector<SVGSVGElement>(".thl-scene")!;
	await expect.poll(() => view()[2]).toBeLessThan(720);
	const initial = view();
	svg.focus();
	await userEvent.keyboard("+");
	expect(view()[2]).toBeLessThan(initial[2]);
	await userEvent.keyboard("{ArrowLeft}");
	expect(view()).not.toEqual(initial);
	await userEvent.keyboard("0");
	expect(view()).toEqual(initial);
	screen.getByRole("group", { name: "Visualization player" }).element().focus();
	await userEvent.keyboard("{ArrowRight}");
	await expect.element(screen.getByRole("status")).toHaveTextContent("Step 2 of 4");
});

it("selects and inspects entities, respecting authored visibility and replacing traces", async () => {
	const trace = compile(source);
	const screen = await render(<ThroughlinePlayer trace={trace} />);
	await userEvent.selectOptions(screen.getByRole("combobox", { name: "Select entity" }).element(), "b");
	await expect.element(screen.getByText(/Selected: Beta/)).toBeVisible();
	expect(document.querySelector('[data-node="b"] .thl-selected')).not.toBeNull();
	await screen.getByRole("button", { name: "Zoom in" }).click();
	await screen.rerender(<ThroughlinePlayer trace={compile(source)} />);
	await expect.element(screen.getByText(/Selected: Beta/)).not.toBeInTheDocument();
	await expect.element(screen.getByRole("button", { name: "Follow active entity" })).toHaveAttribute("aria-pressed", "false");
	expect(view()[2]).toBeGreaterThan(0);
	await screen.getByRole("button", { name: "Fit to view" }).click();
	const newOverview = view();
	expect(newOverview[0]).toBe(0);
});

it("accepts touch drag and pinch without moving the camera again on seek", async () => {
	await page.viewport(375, 850);
	const screen = await render(<ThroughlinePlayer trace={compile(source)} />);
	const svg = document.querySelector<SVGSVGElement>(".thl-scene")!;
	await expect.poll(() => view()[2]).toBeLessThan(720);
	const rect = svg.getBoundingClientRect();
	const x = rect.left + rect.width / 2;
	const y = rect.top + rect.height / 2;
	const fire = (type: string, id: number, dx: number, dy: number) =>
		svg.dispatchEvent(new PointerEvent(type, {
			bubbles: true, pointerId: id, pointerType: "touch", isPrimary: id === 91,
			clientX: x + dx, clientY: y + dy,
		}));
	const overview = view();
	fire("pointerdown", 91, 0, 0);
	fire("pointermove", 91, 35, 15);
	fire("pointerup", 91, 35, 15);
	await expect.poll(view).not.toEqual(overview);
	fire("pointerdown", 91, -30, 0);
	fire("pointerdown", 92, 30, 0);
	fire("pointermove", 91, -55, 0);
	fire("pointermove", 92, 55, 0);
	fire("pointerup", 92, 55, 0);
	fire("pointerup", 91, -55, 0);
	await expect.poll(() => view()[2]).toBeLessThan(overview[2]);
	const after = view();
	await screen.getByRole("button", { name: "Step forward" }).click();
	expect(view()).toEqual(after);
	const player = document.querySelector<HTMLElement>(".thl")!;
	expect(player.scrollWidth).toBeLessThanOrEqual(player.clientWidth);
});
