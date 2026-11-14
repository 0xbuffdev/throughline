import { expect, it } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { compile } from "../../domains/registry.js";
import { ThroughlinePlayer } from "../index.js";
import "../../styles/throughline.css";
import { openPlayerPanel } from "./player-actions.js";

const source = [
	"```thl flow",
	'group "Inner" id inner under outer as row',
	'group "Outer" id outer as column',
	'group "Remote" id remote as row',
	'node a "Alpha" in "Inner" = 1',
	'node b "Beta" in "Inner" = 2',
	'node c "Remote" in "Remote" = 3',
	'link ac a -> c',
	'link bc b -> c',
	'step "Send"',
	'  send ac = "message sent"',
	'step "Hide"',
	'  hide node b',
	"```",
].join("\n");

it("collapses, expands, drills and navigates breadcrumb hierarchy without changing frames", async () => {
	const trace = compile(source);
	const original = structuredClone(trace);
	const screen = await render(<ThroughlinePlayer trace={trace} />);
	await openPlayerPanel(screen, "View");
	const drill = screen.getByRole("combobox", { name: "Drill into group" });
	await userEvent.selectOptions(drill.element(), "inner");
	await expect.element(screen.getByRole("button", { name: "Collapse group Inner" })).toBeEnabled();
	await screen.getByRole("button", { name: "Collapse group Inner" }).click();
	await expect.poll(() => document.querySelectorAll('[data-group-summary="inner"]').length).toBe(1);
	expect(document.querySelector('[data-node="a"]')).toBeNull();
	expect(document.querySelector('[data-node="b"]')).toBeNull();
	await screen.getByText("Details", { exact: true }).click();
	await screen.getByText("Inspect state").click();
	expect(document.querySelector(".thl-inspector")?.textContent).toContain("Beta");
	const tooltip = [...document.querySelectorAll(".thl-link title")]
		.map((element) => element.textContent ?? "");
	expect(tooltip.some((label) => label.includes("ac") && label.includes("bc"))).toBe(true);
	const beforeStroke = getComputedStyle(document.querySelector(".thl-link .thl-edge")!).stroke;
	await screen.getByRole("button", { name: "Step forward" }).click();
	const activeLink = document.querySelector<SVGGElement>(".thl-link.thl-aggregate-active")!;
	expect(activeLink).not.toBeNull();
	expect(activeLink.querySelector("title")?.textContent).toContain("Sent in this step: ac.");
	expect(activeLink.querySelector("title")?.textContent).toContain("ac, bc");
	const activePath = activeLink.querySelector<SVGPathElement>(".thl-edge")!;
	expect(getComputedStyle(activePath).stroke).not.toBe(beforeStroke);
	expect(getComputedStyle(activePath).strokeDasharray).not.toBe("none");
	expect(getComputedStyle(activePath).animationName).toBe("none");
	expect(activeLink.querySelector(".thl-flow")).toBeNull();
	await expect.element(screen.getByRole("status")).toHaveTextContent("Step 2 of 3");
	expect(document.querySelector('[data-group-summary="inner"]')).not.toBeNull();
	await screen.getByRole("button", { name: "Expand group Inner" }).first().click();
	await expect.poll(() => document.querySelectorAll('[data-node="a"]').length).toBe(1);
	await openPlayerPanel(screen, "View");
	await userEvent.selectOptions(screen.getByRole("combobox", { name: "Select entity" }).element(), "a");
	await expect.element(screen.getByText(/Selected: Alpha/)).toBeVisible();
	await screen.getByRole("button", { name: "Return to group overview" }).click();
	expect(trace).toEqual(original);
});

it("supports keyboard summary expansion, respects hidden nodes, and resets hierarchy on trace replacement", async () => {
	await page.viewport(375, 850);
	const trace = compile(source);
	const screen = await render(<ThroughlinePlayer trace={trace} />);
	await openPlayerPanel(screen, "View");
	await userEvent.selectOptions(screen.getByRole("combobox", { name: "Drill into group" }).element(), "outer");
	await screen.getByRole("button", { name: "Collapse group Outer" }).click();
	const summary = document.querySelector<SVGGElement>('[data-group-summary="outer"]')!;
	expect(summary).not.toBeNull();
	summary.focus();
	await userEvent.keyboard("{Enter}");
	await expect.poll(() => document.querySelectorAll('[data-node="a"]').length).toBe(1);
	await screen.getByRole("button", { name: "Step forward" }).click();
	await screen.getByRole("button", { name: "Step forward" }).click();
	expect(document.querySelector('[data-node="b"]')).toBeNull();
	await screen.rerender(<ThroughlinePlayer trace={compile(source)} />);
	await expect.poll(() => document.querySelectorAll('[data-group-summary]').length).toBe(0);
	await openPlayerPanel(screen, "View");
	await expect.element(screen.getByRole("combobox", { name: "Drill into group" })).toHaveValue("");
	const player = document.querySelector<HTMLElement>(".thl")!;
	expect(player.scrollWidth).toBeLessThanOrEqual(player.clientWidth);
});

it("does not add hierarchy chrome to legacy flat-lane players", async () => {
	const flat = compile([
		"```thl flow",
		'group "Memory" as tree',
		'node data "Data" in "Memory" = 1',
		"```",
	].join("\n"));
	await render(<ThroughlinePlayer trace={flat} />);
	expect(document.querySelector(".thl-group-controls")).toBeNull();
	expect(document.querySelector('[data-node="data"]')).not.toBeNull();
});

it("exposes authored focus and writes while descendants remain collapsed", async () => {
	const trace = compile([
		"```thl flow",
		'group "Inner" id inner under outer as row',
		'group "Outer" id outer as column',
		'node a "Alpha" in "Inner" = 1',
		'step "Focus"',
		'  focus a',
		'step "Write"',
		'  set a = 2',
		"```",
	].join("\n"));
	const original = structuredClone(trace);
	const screen = await render(<ThroughlinePlayer trace={trace} />);
	await openPlayerPanel(screen, "View");
	await userEvent.selectOptions(screen.getByRole("combobox", { name: "Drill into group" }).element(), "inner");
	await screen.getByRole("button", { name: "Collapse group Inner" }).click();
	const group = () => document.querySelector<SVGGElement>('[data-group-summary="inner"]')!;
	await expect.poll(() => group()).not.toBeNull();
	expect(group().querySelector(".thl-summary-state")).toBeNull();

	await screen.getByRole("button", { name: "Step forward" }).click();
	await expect.poll(() => group().querySelector(".thl-summary-state")?.textContent).toBe("Focused");
	expect(group().querySelector(".thl-summary-node.thl-focused")).not.toBeNull();
	expect(group().querySelector(".thl-summary-node.thl-changed")).toBeNull();
	expect(group().getAttribute("aria-describedby")).toBe("thl-summary-state-inner");
	expect(group().querySelector("title")?.textContent).toContain("Contains authored active focus.");
	expect(document.querySelector('[data-node="a"]')).toBeNull();

	await screen.getByRole("button", { name: "Step forward" }).click();
	await expect.poll(() => group().querySelector(".thl-summary-state")?.textContent).toBe("Changed · Active");
	expect(group().querySelector(".thl-summary-node.thl-changed")).not.toBeNull();
	expect(group().querySelector("title")?.textContent).toContain("State changed this step.");
	expect(trace.frames[2].state.entities.find((entity) => entity.id === "a")?.value).toBe(2);
	expect(trace).toEqual(original);
});
