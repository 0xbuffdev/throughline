import { expect, it } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-react";
import { compile } from "../../domains/registry.js";
import { CHECKOUT_SCENARIOS, EXAMPLES } from "../../examples.js";
import { ThroughlinePlayer, ThroughlineScenarios } from "../index.js";
import "../../styles/throughline.css";

const checkout = compile(EXAMPLES.find((example) => example.id === "distributed-checkout")!.source);
const at = (label: string) => checkout.frames.findIndex((frame) => frame.label === label);
const link = (from: string, to: string) =>
	[...document.querySelectorAll<SVGGElement>(".thl-link")].find((element) =>
		element.querySelector("title")?.textContent?.trim().startsWith(from + " → " + to),
	);

it("keeps checkout history highlighted without faking future responses", async () => {
	await page.viewport(375, 850);
	const original = structuredClone(checkout);
	const screen = await render(<ThroughlinePlayer trace={checkout} />);
	const timeline = screen.getByRole("slider", { name: "Timeline" });
	expect(document.querySelectorAll(".thl-visited")).toHaveLength(0);

	await timeline.fill(String(at("Send first charge request")));
	const request = link("customer", "api")!;
	const charge = link("worker", "provider")!;
	const acknowledge = link("provider", "worker")!;
	expect(request.classList.contains("thl-visited")).toBe(true);
	expect(charge.classList.contains("thl-visited")).toBe(true);
	expect(charge.classList.contains("thl-transferred")).toBe(true);
	expect(acknowledge.classList.contains("thl-visited")).toBe(false);
	expect(document.querySelector('[data-node="customer"] .thl-node.thl-visited')).not.toBeNull();
	expect(document.querySelector('[data-node="provider"] .thl-node.thl-visited')).not.toBeNull();
	expect(document.querySelector('[data-node="receipt"] .thl-node.thl-visited')).toBeNull();
	expect(screen.getByRole("status").element().textContent).toContain("Workflow so far:");

	// The same SVG path is drawn, never a second superimposed line.
	const activePath = charge.querySelector<SVGPathElement>(".thl-edge")!;
	expect(charge.querySelectorAll("path")).toHaveLength(1);
	expect(document.querySelector(".thl-flow")).toBeNull();
	expect(activePath.getAttribute("pathLength")).toBe("1");
	if (!matchMedia("(prefers-reduced-motion: reduce)").matches)
		expect(getComputedStyle(activePath).animationName).toBe("thl-draw");

	await timeline.fill(String(at("Provider records charge")));
	expect(charge.classList.contains("thl-visited")).toBe(true);
	expect(charge.classList.contains("thl-transferred")).toBe(false);
	expect(acknowledge.classList.contains("thl-visited")).toBe(false);

	await timeline.fill(String(at("Receive confirmed result")));
	expect(acknowledge.classList.contains("thl-visited")).toBe(true);
	expect(acknowledge.classList.contains("thl-transferred")).toBe(true);
	expect(document.querySelector('[data-node="receipt"] .thl-node.thl-visited')).toBeNull();
	await timeline.fill(String(at("Persist payment confirmation")));
	expect(document.querySelector('[data-node="receipt"] .thl-node.thl-visited')).not.toBeNull();

	await timeline.fill(String(checkout.frames.length - 1));
	expect(link("customer", "api")?.classList.contains("thl-visited")).toBe(true);
	expect(link("provider", "worker")?.classList.contains("thl-visited")).toBe(true);
	expect(link("worker", "receipt")?.classList.contains("thl-visited")).toBe(true);
	await timeline.fill("0");
	expect(document.querySelectorAll(".thl-visited")).toHaveLength(0);
	expect(checkout).toEqual(original);
	const player = document.querySelector<HTMLElement>(".thl")!;
	expect(player.scrollWidth).toBeLessThanOrEqual(player.clientWidth);
});

it("keeps explicitly revealed reconciliation links distinct from sent messages", async () => {
	const trace = compile(EXAMPLES.find((example) => example.id === "reconciliation")!.source);
	const screen = await render(<ThroughlinePlayer trace={trace} />);
	const reuse = trace.frames.findIndex((frame) => frame.label === "Reuse key a");
	await screen.getByRole("slider", { name: "Timeline" }).fill(String(reuse));
	const match = link("a", "reuse")!;
	expect(match.classList.contains("thl-revealed")).toBe(true);
	expect(match.classList.contains("thl-visited")).toBe(false);
	expect(match.classList.contains("thl-transferred")).toBe(false);
	expect(match.querySelector("desc")?.textContent).toContain("no message transfer implied");
	await screen.getByRole("slider", { name: "Timeline" }).fill(String(trace.frames.length - 1));
	expect(link("a", "reuse")).toBeUndefined();
});

it("keeps exact partial provenance under group collapse without animating a made-up aggregate send", async () => {
	const source = [
		"thl flow",
		'group "Inner" id inner under outer as row',
		'group "Outer" id outer as column',
		'group "Remote" id remote as row',
		'node a "Alpha" in "Inner" = 1',
		'node b "Beta" in "Inner" = 2',
		'node c "Remote" in "Remote" = 3',
		"link ac a -> c",
		"link bc b -> c",
		'step "Send from A"',
		'  send ac = 1',
		'step "Update B"',
		'  set b = 4',
	].join("\n");
	const screen = await render(<ThroughlinePlayer trace={compile(source)} />);
	await screen.getByRole("combobox", { name: "Drill into group" }).selectOptions("inner");
	await screen.getByRole("button", { name: "Collapse group Inner" }).click();
	await screen.getByRole("slider", { name: "Timeline" }).fill("1");
	const aggregate = document.querySelector<SVGGElement>(".thl-link.thl-aggregate-active")!;
	expect(aggregate).not.toBeNull();
	expect(aggregate.classList.contains("thl-aggregate-visited")).toBe(true);
	expect(aggregate.querySelector("title")?.textContent).toContain("1 of 2 connections sent so far");
	expect(aggregate.querySelectorAll("path")).toHaveLength(1);
	expect(getComputedStyle(aggregate.querySelector(".thl-edge")!).animationName).toBe("none");
	await screen.getByRole("slider", { name: "Timeline" }).fill("2");
	expect(aggregate.classList.contains("thl-aggregate-visited")).toBe(true);
	expect(aggregate.classList.contains("thl-aggregate-active")).toBe(false);
	expect(document.querySelector(".thl-summary-node.thl-visited")).not.toBeNull();
});

it("reset independent scenario progress instead of leaking another scenario's past", async () => {
	const scenarios = CHECKOUT_SCENARIOS.slice(0, 2).map((scenario) => ({
		id: scenario.id, title: scenario.title, trace: compile(scenario.source),
	}));
	const screen = await render(<ThroughlineScenarios scenarios={scenarios} />);
	await screen.getByRole("slider", { name: "Timeline" }).fill("4");
	expect(document.querySelectorAll(".thl-visited").length).toBeGreaterThan(0);
	await screen.getByRole("combobox", { name: "Scenario" }).selectOptions("terminal-failure");
	expect(document.querySelectorAll(".thl-visited")).toHaveLength(0);
	await expect.element(screen.getByRole("slider", { name: "Timeline" })).toHaveAttribute("aria-valuetext", "Step 1 of 6");
});

it("restarts drawing the same connector on consecutive authored sends without adding another path", async () => {
	const trace = compile([
		"thl flow",
		'node a "Sender" = 0',
		'node b "Receiver" = 0',
		'link ab a -> b "delivery"',
		'step "First delivery"',
		'  send ab = 1',
		'step "Second delivery"',
		'  send ab = 2',
		'step "Completed"',
		'  note "No new send"',
	].join("\n"));
	const screen = await render(<ThroughlinePlayer trace={trace} />);
	const forward = screen.getByRole("button", { name: "Step forward" });
	await forward.click();
	const connection = link("a", "b")!;
	const firstPath = connection.querySelector<SVGPathElement>(".thl-edge")!;
	expect(connection.querySelectorAll("path")).toHaveLength(1);
	await forward.click();
	const secondPath = connection.querySelector<SVGPathElement>(".thl-edge")!;
	expect(secondPath).not.toBe(firstPath);
	expect(connection.querySelectorAll("path")).toHaveLength(1);
	expect(connection.classList.contains("thl-transferred")).toBe(true);
	await forward.click();
	expect(connection.classList.contains("thl-transferred")).toBe(false);
	expect(connection.classList.contains("thl-visited")).toBe(true);
	expect(connection.querySelectorAll("path")).toHaveLength(1);
});
