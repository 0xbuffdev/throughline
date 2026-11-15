import { expect, it } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { compileArtifact } from "../../v2/compiler.js";
import { distributedGraph } from "../../__tests__/v2-graph-fixture.js";
import { retryCheckout } from "../../__tests__/v2-sequence-fixture.js";
import { ThroughlineGraphPlayer } from "../graph-player.js";
import "../../styles/throughline.css";

const view = () => document.querySelector<HTMLElement>(".thl-v2-inspect");
const exact = (text: string) => ({ name: text, exact: true } as const);
const checkout = () => compileArtifact(distributedGraph());

it("uses shared playback frame for Explain and Inspect, including precise explicit changes", async () => {
	const screen = await render(<ThroughlineGraphPlayer trace={checkout()} initialView="graph" />);
	await expect.element(screen.getByRole("img",
		{ name: "Source-linked graph at current frame" })).toBeVisible();
	for (let i = 0; i < 3; i++)
		await screen.getByRole("button", { name: "Step forward" }).click();
	await expect.element(screen.getByRole("status")).toHaveTextContent("Step 4 of 7");
	await screen.getByRole("button", exact("Inspect")).click();
	await expect.element(screen.getByRole("region", { name: "Evidence inspector" }))
		.toBeVisible();
	await expect.element(screen.getByRole("region", { name: "What changed?" }))
		.toBeVisible();
	expect(document.querySelector(".thl-v2-diagram")).toBeNull();
	expect(view()?.textContent).toContain("Explicit modeled write");
	expect(document.querySelector('tr[data-source-event-ids="settled"]')).not.toBeNull();
	expect(document.querySelector('tr[data-source-event-ids="processed"]')).toBeNull();
	expect(view()?.textContent).toContain("1 explicit mutation(s)");
	await screen.getByRole("button", { name: "Step back" }).click();
	await expect.element(screen.getByRole("status")).toHaveTextContent("Step 3 of 7");
	expect(view()?.textContent).toContain("No explicit write or presence change");
	await screen.getByRole("button", exact("Explain")).click();
	await expect.element(screen.getByRole("img",
		{ name: "Source-linked graph at current frame" })).toBeVisible();
	await expect.element(screen.getByRole("status")).toHaveTextContent("Step 3 of 7");
});

it("shows unknown, absent and known-null path results and original parent-write history", async () => {
	const source = distributedGraph();
	source.claims = [];
	source.steps.push({
		id: "replaceClient", label: "Replace root", events: [{
			id: "replace", type: "write", originId: "author",
			entityId: "client", path: [],
			value: { status: "known", value: { paid: true } },
		}],
	});
	const screen = await render(<ThroughlineGraphPlayer trace={compileArtifact(source)} />);
	await screen.getByRole("button", exact("Inspect")).click();
	await userEvent.selectOptions(
		screen.getByRole("combobox", { name: "Inspect entity" }).element(), "gateway",
	);
	expect(view()?.textContent).toContain("Unknown: not measured");
	await userEvent.selectOptions(
		screen.getByRole("combobox", { name: "Inspect entity" }).element(), "ledger",
	);
	await userEvent.type(screen.getByRole("textbox", { name: "Inspect path" }), '["amount"]');
	await screen.getByRole("button", { name: "Inspect path" }).click();
	await expect.element(screen.getByRole("table", {
		name: "Previous and current modeled state at requested path",
	})).toBeVisible();
	expect(view()?.textContent).toContain("Known: null");
	await userEvent.selectOptions(
		screen.getByRole("combobox", { name: "Inspect entity" }).element(), "client",
	);
	await screen.getByRole("button", { name: "Step forward" }).click();
	await screen.getByRole("group", { name: "Visualization player" }).element().focus();
	await userEvent.keyboard("{End}");
	await expect.element(screen.getByRole("status")).toHaveTextContent("Step 8 of 8");
	const input = screen.getByRole("textbox", { name: "Inspect path" });
	await userEvent.type(input, '["amount"]');
	await screen.getByRole("button", { name: "Inspect path" }).click();
	expect(view()?.textContent).toContain("Absent at requested path");
	expect(view()?.textContent).toContain("Known: 25");
	expect(view()?.textContent).toContain("replace");
	expect(view()?.textContent).toContain("Whole entity");
	await userEvent.clear(input);
	await userEvent.type(input, '["__proto__"]');
	await screen.getByRole("button", { name: "Inspect path" }).click();
	await expect.element(screen.getByRole("alert")).toBeVisible();
	expect(view()?.textContent).toContain("Absent at requested path");
});

it("keeps message phase evidence separate from persistence while investigating a relation", async () => {
	const screen = await render(<ThroughlineGraphPlayer trace={compileArtifact(retryCheckout())}/>);
	await screen.getByRole("button", { name: "Step forward" }).click();
	await screen.getByRole("button", exact("Inspect")).click();
	await expect.element(screen.getByRole("region", { name: "Where did this message go?" }))
		.toBeVisible();
	expect(document.querySelector('[data-source-event-ids="originalSent"]')).not.toBeNull();
	expect(view()?.textContent).toContain("A sent event alone cannot establish receipt");
	expect(view()?.textContent).toContain("explicitly modeled phase event(s) through this frame");
	expect(view()?.textContent).toContain("No explicit write or presence change");
	await screen.getByRole("button", { name: "Step forward" }).click();
	await expect.element(screen.getByRole("status")).toHaveTextContent("Step 3 of 10");
	expect(view()?.textContent).toContain("originalReceived");
	expect(view()?.textContent).toContain("originalProcessed");
	expect(view()?.textContent).toContain("Unknown: no state measurement");
	await userEvent.selectOptions(
		screen.getByRole("combobox", { name: "Inspect relation" }).element(), "write",
	);
	expect(view()?.textContent).toContain("No message phase evidence on this relation");
});

it("guides through exact declared dependencies and non-proof editorial claims", async () => {
	const source = distributedGraph();
	source.steps[1].events[0].dependsOn = ["sent"];
	source.claims = [{
		id: "pendingExplanation", text: "The request caused worker removal",
		kind: "causal", originId: "author", review: "reviewed",
		evidenceEventIds: ["sent", "workerOff"],
	}];
	const screen = await render(<ThroughlineGraphPlayer trace={compileArtifact(source)}
		initialView="graph" />);
	await screen.getByRole("button", { name: "Step forward" }).click();
	await screen.getByRole("button", exact("Inspect")).click();
	await expect.element(screen.getByRole("region", { name: "Focused source event" }))
		.toBeVisible();
	const focus = document.querySelector<HTMLElement>(".thl-v2-inspect-focus")!;
	expect(focus.textContent).toContain("No explicit causal dependency is modeled");
	expect(focus.textContent).toContain("The request caused worker removal");
	expect(focus.textContent).toContain("not yet");
	expect(focus.textContent).toContain("Editorial review is not scientific proof");
	await screen.getByRole("button", { name: "Step forward" }).click();
	const focused = document.querySelector<HTMLElement>(".thl-v2-inspect-focus")!;
	expect(focused.textContent).toContain("Explicitly declared dependencies");
	expect(focused.textContent).toContain("sent");
	await screen.getByRole("region", { name: "Focused source event" })
		.getByRole("button", { name: /Inspect event sent \(step 2\)/ }).click();
	await expect.element(screen.getByRole("status")).toHaveTextContent("Step 2 of 7");
	expect(focus.textContent).toContain("1 cited event(s) are not yet");
	await screen.getByRole("group", { name: "Visualization player" }).element().focus();
	await userEvent.keyboard("{End}");
	await expect.element(screen.getByRole("status")).toHaveTextContent("Step 7 of 7");
	expect(focus.textContent).toContain("does not independently verify this claim");
});

it("responds to keyboard seeking at mobile widths with truthful empty evidence", async () => {
	await page.viewport(375, 800);
	const source = distributedGraph();
	source.steps = [];
	source.claims = [];
	const screen = await render(<ThroughlineGraphPlayer trace={compileArtifact(source)}
		initialView="state-table" />);
	await screen.getByRole("button", exact("Inspect")).click();
	const root = document.querySelector<HTMLElement>(".thl-v2")!;
	await expect.element(screen.getByRole("region", { name: "Evidence inspector" }))
		.toBeVisible();
	expect(root.scrollWidth).toBeLessThanOrEqual(root.clientWidth);
	expect(view()?.textContent).toContain("No explicit write or presence change");
	expect(view()?.textContent).toContain("No events are authored in this frame");
	expect(view()?.textContent).toContain("There is no explicit causal evidence to evaluate");
	await screen.getByRole("button", exact("Explain")).click();
	await expect.element(screen.getByRole("region", { name: "State and event table" }))
		.toBeVisible();
	expect(root.scrollWidth).toBeLessThanOrEqual(root.clientWidth);
});
