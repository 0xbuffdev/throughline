import { expect, it } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { compileArtifact } from "../../v2/compiler.js";
import { distributedGraph } from "../../__tests__/v2-graph-fixture.js";
import { ThroughlineGraphPlayer } from "../graph-player.js";
import "../../styles/throughline.css";

const trace = () => compileArtifact(distributedGraph());
const currentLinks = () =>
	[...document.querySelectorAll<SVGGElement>(".thl-v2-diagram .thl-link")];
const link = (sourceId: string): SVGGElement | undefined =>
	currentLinks().find(element =>
		element.getAttribute("data-source-relation-ids")?.split(" ").includes(sourceId));
const viewBox = (): number[] => (document.querySelector(".thl-v2-diagram")
	?.getAttribute("viewBox") ?? "").split(" ").map(Number);

it("plays a source-linked checkout without pretending received or processed means sent or persisted", async () => {
	const screen = await render(<ThroughlineGraphPlayer trace={trace()} />);
	await expect.element(screen.getByRole("img", { name: "Source-linked graph at current frame" }))
		.toBeVisible();
	expect(link("request")?.getAttribute("data-sent-current")).toBe("0");
	expect(document.querySelector('[data-node="worker"]')).toBeNull();
	const next = screen.getByRole("button", { name: "Step forward" });
	await next.click(); // dispatch authored sent
	await expect.element(screen.getByRole("status")).toHaveTextContent("Step 2 of 7");
	expect(link("request")?.getAttribute("data-sent-current")).toBe("1");
	expect(link("request")?.classList.contains("thl-transferred")).toBe(true);
	expect(document.querySelector('[data-source-event-ids="sent"]')).not.toBeNull();
	await next.click(); // received and observation, no write
	expect(link("request")?.getAttribute("data-sent-current")).toBe("0");
	expect(link("request")?.getAttribute("data-visited")).toBe("true");
	expect(link("request")?.classList.contains("thl-transferred")).toBe(false);
	expect(document.querySelector('[data-node="gateway"] .thl-v2-value')?.textContent)
		.toContain("Unknown");
	// Truncated graph labels are not full-state evidence; inspect the
	// selected source entity to verify the actual persistent value.
	await screen.getByRole("button", { name: "Select Ledger" }).click();
	expect(document.querySelector(".thl-v2-selection pre")?.textContent)
		.toContain('"settled":false');
	await next.click(); // ledger write + processed, no second sent
	expect(link("settlement")?.getAttribute("data-sent-current")).toBe("0");
	expect(link("settlement")?.classList.contains("thl-transferred")).toBe(false);
	await next.click(); // worker activated, no sent
	expect(document.querySelector('[data-node="worker"]')).not.toBeNull();
	expect(link("task")?.getAttribute("data-sent-current")).toBe("0");
	await next.click(); // actual sent task + unrelated ack
	expect(link("task")?.getAttribute("data-sent-current")).toBe("1");
	expect(link("request")?.getAttribute("data-sent-current")).toBe("0");
	await next.click(); // topology removes worker
	expect(document.querySelector('[data-node="worker"]')).toBeNull();
	expect(link("task")).toBeUndefined();
	await screen.getByRole("button", { name: "Step back" }).click();
	expect(link("task")?.getAttribute("data-sent-current")).toBe("1");
});

it("collapses and expands nested groups without losing relation/event provenance or selections", async () => {
	const screen = await render(<ThroughlineGraphPlayer trace={trace()} />);
	await screen.getByRole("button", { name: "Step forward" }).click();
	await screen.getByRole("button", { name: "Player options" }).click();
	const choice = screen.getByRole("combobox", { name: "Select entity" }).element();
	await userEvent.selectOptions(choice, "gateway");
	await expect.element(screen.getByText("Selected: Gateway")).toBeVisible();
	await screen.getByRole("button", { name: "Collapse Frontend" }).click();
	const summary = document.querySelector('[data-group-summary="front"]');
	expect(summary).not.toBeNull();
	expect(summary?.getAttribute("data-source-entity-ids")).toBe("client gateway");
	expect(summary?.getAttribute("data-source-relation-ids")).toBe("request");
	expect(summary?.getAttribute("data-source-event-ids")).toBe("sent");
	expect(document.querySelector('[data-node="gateway"]')).toBeNull();
	expect(link("settlement")?.getAttribute("data-source-relation-ids")).toBe("settlement");
	expect(link("request")).toBeUndefined();
	// The options popover is intentionally layered over the diagram: close it
	// before using the graphical group-summary button.
	await screen.getByRole("button", { name: "Player options" }).click();
	await screen.getByRole("button", { name: "Expand group Frontend" }).click();
	expect(document.querySelector('[data-node="gateway"]')).not.toBeNull();
	expect(link("request")?.getAttribute("data-sent-current")).toBe("1");
	await expect.element(screen.getByText("Selected: Gateway")).toBeVisible();
});

it("paints parent panels first for valid child-before-parent group declarations", async () => {
	const artifact = distributedGraph();
	// The validator accepts this order: parent references resolve after
	// every group has been parsed, independently of source declaration order.
	artifact.groups = [
		{ id: "back", label: "Backend", parentId: "system" },
		{ id: "front", label: "Frontend", parentId: "system" },
		{ id: "system", label: "Checkout" },
	];
	const screen = await render(
		<ThroughlineGraphPlayer trace={compileArtifact(artifact)} />,
	);
	await expect.element(screen.getByRole("img",
		{ name: "Source-linked graph at current frame" })).toBeVisible();
	const groupPanels = () => [...document.querySelectorAll<SVGGElement>(
		".thl-v2-diagram g[data-group]",
	)].map(group => group.getAttribute("data-group"));
	// SVG is paint-order sensitive: later opaque rects cover earlier ones.
	expect(groupPanels()).toEqual(["system", "back", "front"]);
	const root = document.querySelector<SVGGElement>('[data-group="system"] rect')!;
	const child = document.querySelector<SVGGElement>('[data-group="back"] rect')!;
	expect(root).not.toBeNull();
	expect(child).not.toBeNull();
	expect(Number(child.getAttribute("y"))).toBeGreaterThan(
		Number(root.getAttribute("y")),
	);
	await screen.getByRole("button", { name: "Player options" }).click();
	await screen.getByRole("button", { name: "Collapse Backend" }).click();
	expect(groupPanels()).toEqual(["system", "back", "front"]);
	expect(document.querySelector('[data-group-summary="back"]')).not.toBeNull();
});

it("retains source IDs of removed members in a collapsed graphical group summary", async () => {
	const screen = await render(<ThroughlineGraphPlayer trace={trace()} />);
	await screen.getByRole("button", { name: "Player options" }).click();
	await screen.getByRole("button", { name: "Collapse Backend" }).click();
	await screen.getByRole("button", { name: "Player options" }).click();
	for (let index = 0; index < 6; index++)
		await screen.getByRole("button", { name: "Step forward" }).click();
	await expect.element(screen.getByRole("status")).toHaveTextContent("Step 7 of 7");
	const summary = document.querySelector<SVGGElement>('[data-group-summary="back"]');
	expect(summary).not.toBeNull();
	expect(summary?.getAttribute("data-source-entity-ids")).toBe("ledger worker");
	expect(summary?.getAttribute("data-source-relation-ids")).toBe("task");
	expect(summary?.getAttribute("data-source-event-ids")).toBe("taskOff workerOff");
	expect(document.querySelector('[data-node="worker"]')).toBeNull();
	expect(link("task")).toBeUndefined();
});

it("announces declared non-authored origins without upgrading modeled event evidence", async () => {
	const artifact = distributedGraph();
	artifact.steps[3].events[0].originId = "witness"; // declared observed
	const screen = await render(<ThroughlineGraphPlayer trace={compileArtifact(artifact)} />);
	for (let index = 0; index < 4; index++)
		await screen.getByRole("button", { name: "Step forward" }).click();
	const evidence = screen.getByRole("list", { name: "Declared step evidence" });
	await expect.element(evidence).toBeVisible();
	await expect.element(screen.getByText(/Declared origin witness \(observed\)/)).toBeVisible();
	expect(evidence.element().textContent).toContain("provenance is not independent verification");
	expect(evidence.element().textContent).not.toContain("Authored presence");
});

it("supports keyboard stepping, zoom and pan independently of v2 model state", async () => {
	const screen = await render(<ThroughlineGraphPlayer trace={trace()} />);
	await expect.poll(() => viewBox()[2]).toBeLessThan(720);
	const start = viewBox();
	const svg = document.querySelector<SVGSVGElement>(".thl-v2-diagram")!;
	svg.focus();
	await userEvent.keyboard("+");
	expect(viewBox()[2]).toBeLessThan(start[2]);
	await userEvent.keyboard("{ArrowLeft}");
	expect(viewBox()).not.toEqual(start);
	await userEvent.keyboard("0");
	expect(viewBox()).toEqual(start);
	screen.getByRole("group", { name: "Visualization player" }).element().focus();
	await userEvent.keyboard("{ArrowRight}");
	await expect.element(screen.getByRole("status")).toHaveTextContent("Step 2 of 7");
	expect(document.querySelector('[data-node="client"]')).not.toBeNull();
	await expect.element(screen.getByRole("button", { name: "Fit to view" })).toBeVisible();
});

it("presents a truthful table fallback and source-linked values without changing frame state", async () => {
	const screen = await render(<ThroughlineGraphPlayer trace={trace()} />);
	await screen.getByRole("button", { name: "Player options" }).click();
	await userEvent.selectOptions(
		screen.getByRole("combobox", { name: "Visualization view" }).element(),
		"state-table",
	);
	await expect.element(screen.getByRole("region", { name: "State and event table" })).toBeVisible();
	expect(document.querySelector(".thl-v2-diagram")).toBeNull();
	await expect.element(screen.getByText("Unknown: not measured")).toBeVisible();
	await screen.getByRole("button", { name: "Step forward" }).click();
	await expect.element(screen.getByRole("status")).toHaveTextContent("Step 2 of 7");
	expect(document.querySelector('[data-source-event-ids="sent"]')).not.toBeNull();
	// Clicking outside the native popover dismisses it; reopen the options
	// for a view change, as an actual user would.
	await screen.getByRole("button", { name: "Player options" }).click();
	await userEvent.selectOptions(
		screen.getByRole("combobox", { name: "Visualization view" }).element(),
		"graph",
	);
	expect(link("request")?.getAttribute("data-sent-current")).toBe("1");
});

it("fits a mobile host and safely resets presentation on trace replacement", async () => {
	await page.viewport(375, 800);
	const original = trace();
	const screen = await render(<ThroughlineGraphPlayer trace={original}/>);
	await expect.poll(() => viewBox()[2]).toBeLessThan(720);
	const container = document.querySelector(".thl-v2")!;
	expect(container.scrollWidth).toBeLessThanOrEqual(container.clientWidth);
	await screen.getByRole("button", { name: "Step forward" }).click();
	await screen.getByRole("button", { name: "Player options" }).click();
	await screen.getByRole("button", { name: "Collapse Frontend" }).click();
	const next = distributedGraph();
	next.steps = [];
	next.claims = [];
	await screen.rerender(<ThroughlineGraphPlayer trace={compileArtifact(next)}/>);
	await expect.element(screen.getByRole("status")).toHaveTextContent("Step 1 of 1");
	expect(document.querySelector('[data-group-summary="front"]')).toBeNull();
	await expect.element(screen.getByRole("button", { name: "Play", exact: true })).toBeDisabled();
});
