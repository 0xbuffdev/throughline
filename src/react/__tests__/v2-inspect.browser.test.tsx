import { expect, it } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { compileArtifact } from "../../v2/compiler.js";
import { distributedGraph } from "../../__tests__/v2-graph-fixture.js";
import { retryCheckout } from "../../__tests__/v2-sequence-fixture.js";
import { claimHeavyInspection } from "../../__tests__/v2-claims-fixture.js";
import { ThroughlineGraphPlayer } from "../graph-player.js";
import "../../styles/throughline.css";

const view = () => document.querySelector<HTMLElement>(".thl-v2-inspect");
const exact = (text: string) => ({ name: text, exact: true } as const);
const checkout = () => compileArtifact(distributedGraph());
async function openInspector(screen: Awaited<ReturnType<typeof render>>, tool?: string) {
 await screen.getByRole("button", exact("Inspect")).click();
 await screen.getByText("Source details", { exact: true }).click();
 if (tool) await screen.getByText(tool, { exact: true }).click();
}


it("uses shared playback frame for canvas and inspector, including precise explicit changes", async () => {
	const screen = await render(<ThroughlineGraphPlayer trace={checkout()} initialView="graph" />);
	await expect.element(screen.getByRole("img",
		{ name: "Source-linked graph at current frame" })).toBeVisible();
	for (let i = 0; i < 3; i++)
		await screen.getByRole("button", { name: "Step forward" }).click();
	await expect.element(screen.getByRole("status")).toHaveTextContent("Step 4 of 7");
	await screen.getByRole("button", exact("Inspect")).click();
	await expect.element(screen.getByText("This step", { exact: true })).toBeVisible();
	await expect.element(screen.getByRole("list", { name: "Events in this step" })).toBeVisible();
	expect(view()).toBeNull();
	await screen.getByText("Source details", { exact: true }).click();
	await expect.element(screen.getByRole("region", { name: "Evidence inspector" }))
		.toBeVisible();
	expect(document.querySelectorAll(".inspect-tool[open]")).toHaveLength(0);
	await screen.getByText("Compare steps", { exact: true }).click();
	await expect.element(screen.getByRole("region", { name: "What changed?" }))
		.toBeVisible();
	await expect.element(screen.getByRole("spinbutton", { name: "Compare from step" })).toHaveValue(3);
	expect(document.querySelector(".thl-v2-diagram")).not.toBeNull();
	expect(view()?.textContent).toContain("Explicit modeled write");
	expect(document.querySelector('tr[data-source-event-ids="settled"]')).not.toBeNull();
	expect(document.querySelector('tr[data-source-event-ids="processed"]')).toBeNull();
	expect(view()?.textContent).toContain("1 explicit mutation(s)");
	await screen.getByRole("button", { name: "Step back" }).click();
	await expect.element(screen.getByRole("status")).toHaveTextContent("Step 3 of 7");
	expect(view()?.textContent).toContain("No explicit write or presence change");
	await screen.getByRole("button", { name: "Close inspector" }).click();
	await expect.element(screen.getByRole("img",
		{ name: "Source-linked graph at current frame" })).toBeVisible();
	await expect.element(screen.getByRole("status")).toHaveTextContent("Step 3 of 7");
});

it("starts with the selected entity and keeps full history available in Source details", async () => {
	const screen = await render(<ThroughlineGraphPlayer trace={checkout()} initialView="state-table" />);
	for (let i = 0; i < 3; i++) await screen.getByRole("button", { name: "Step forward" }).click();
	await screen.getByRole("button", { name: "Ledger", exact: true }).click();
	const panel = screen.getByRole("complementary", { name: "Workflow inspector" });
	await expect.element(panel.getByText("Step 4 of 7", { exact: true })).toBeVisible();
	await expect.element(panel.getByText("Latest update", { exact: true })).toBeVisible();
	expect(view()).toBeNull();
	await screen.getByText("Source details", { exact: true }).click();
	expect(panel.element().querySelectorAll(".inspect-tool[open]")).toHaveLength(0);
	await screen.getByText("Values and write history", { exact: true }).click();
	await expect.element(panel.getByRole("table", { name: "Only explicit overlapping writes through this frame" }))
		.toBeVisible();
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
	await openInspector(screen, "Values and write history");
	await userEvent.selectOptions(
		screen.getByRole("combobox", { name: "Inspect entity" }).element(), "gateway",
	);
	expect(view()?.textContent).toContain("Unknown: not measured");
	await userEvent.selectOptions(
		screen.getByRole("combobox", { name: "Inspect entity" }).element(), "ledger",
	);
	await screen.getByRole("textbox", { name: "Inspect path" }).fill('["amount"]');
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
	await input.fill('["amount"]');
	await screen.getByRole("button", { name: "Inspect path" }).click();
	expect(view()?.textContent).toContain("Absent at requested path");
	expect(view()?.textContent).toContain("Known: 25");
	expect(view()?.textContent).toContain("replace");
	expect(view()?.textContent).toContain("Whole entity");
	await input.fill('["__proto__"]');
	await screen.getByRole("button", { name: "Inspect path" }).click();
	await expect.element(screen.getByRole("alert")).toBeVisible();
	expect(view()?.textContent).toContain("Absent at requested path");
});

it("keeps message phase evidence separate from persistence while investigating a relation", async () => {
	const screen = await render(<ThroughlineGraphPlayer trace={compileArtifact(retryCheckout())}/>);
	await screen.getByRole("button", { name: "Step forward" }).click();
	await openInspector(screen, "Message phases");
	await expect.element(screen.getByRole("region", { name: "Where did this message go?" }))
		.toBeVisible();
	const relation = screen.getByRole("combobox", { name: "Inspect relation" });
	await expect.element(relation).toHaveValue("");
	await userEvent.selectOptions(relation.element(), "request");
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
	await openInspector(screen, "Events and evidence");
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
	await openInspector(screen);
	const root = document.querySelector<HTMLElement>(".thl-v2")!;
	await expect.element(screen.getByRole("region", { name: "Evidence inspector" }))
		.toBeVisible();
	expect(root.scrollWidth).toBeLessThanOrEqual(root.clientWidth);
	expect(view()?.textContent).toContain("No explicit write or presence change");
	expect(view()?.textContent).toContain("No events are authored in this frame");
	expect(view()?.textContent).toContain("There is no explicit causal evidence to evaluate");
	await screen.getByRole("button", { name: "Close inspector" }).click();
	await expect.element(screen.getByRole("region", { name: "State and event table" }))
		.toBeVisible();
	expect(root.scrollWidth).toBeLessThanOrEqual(root.clientWidth);
});

it("shows exact before/after values after a shared 150-character preview", async () => {
	const prefix = "A".repeat(2399);
	const source = {
		schemaVersion: 2 as const, id: "longRoot",
		origins: [{ id: "author", kind: "authored" as const }],
		entities: [{ id: "value", label: "Long value" }],
		relations: [],
		initialState: { value: { status: "known" as const, value: prefix + "x" } },
		steps: [{ id: "replace", label: "Replace root string", events: [{
			id: "longWrite", type: "write" as const, originId: "author",
			entityId: "value", path: [],
			value: { status: "known" as const, value: prefix + "y" },
		}] }],
	};
	const screen = await render(<ThroughlineGraphPlayer
		trace={compileArtifact(source)} initialView="state-table"/>);
	await screen.getByRole("button", { name: "Step forward" }).click();
	await openInspector(screen, "Compare steps");
	const table = screen.getByRole("table", { name: "Authored changes, in frame/event order" });
	await expect.element(table).toBeVisible();
	const row = table.getByRole("row", { name: /longWrite/ });
	const previews = row.element().querySelectorAll(".thl-v2-inspect-value > code");
	expect(previews).toHaveLength(2);
	expect(previews[0].textContent).toBe(previews[1].textContent);
	expect(previews[0].textContent).toContain("(truncated preview)");

	await row.getByRole("button", { name: /Show exact before event longWrite/ }).click();
	const before = screen.getByRole("region", { name: "Exact before event longWrite" });
	await expect.element(before).toBeVisible();
	expect(before.element().querySelector("pre")?.textContent?.length)
		.toBeLessThanOrEqual(1024);
	await before.getByRole("button", { name: "Next value segment" }).click();
	await before.getByRole("button", { name: "Next value segment" }).click();
	expect(before.element().querySelector("pre")?.textContent?.endsWith('x"')).toBe(true);
	await expect.element(before.getByRole("button", { name: "Next value segment" }))
		.toBeDisabled();

	await row.getByRole("button", { name: /Show exact after event longWrite/ }).click();
	const after = screen.getByRole("region", { name: "Exact after event longWrite" });
	await after.getByRole("button", { name: "Next value segment" }).click();
	await after.getByRole("button", { name: "Next value segment" }).click();
	expect(after.element().querySelector("pre")?.textContent?.endsWith('y"')).toBe(true);
	expect(after.element().querySelector("pre")?.textContent)
		.not.toBe(before.element().querySelector("pre")?.textContent);
	// The historical and selected-path cells use the exact same expansion
	// component rather than a second, truncating data interpretation.
	// No before/current path table exists until an entity is selected.
	expect(view()?.textContent).not.toContain("Previous and current modeled state at requested path");
	await screen.getByText("Values and write history", { exact: true }).click();
	expect(document.querySelectorAll(".inspect-tool[open]")).toHaveLength(1);
	await userEvent.selectOptions(
		screen.getByRole("combobox", { name: "Inspect entity" }).element(), "value",
	);
	const selection = screen.getByRole("table", {
		name: "Previous and current modeled state at requested path",
	});
	await expect.element(selection).toBeVisible();
	expect(selection.element().querySelectorAll(".thl-v2-inspect-value > code")).toHaveLength(2);
});

it("exposes the recorded timeout observation while leaving modeled client state unchanged", async () => {
	const screen = await render(<ThroughlineGraphPlayer trace={compileArtifact(retryCheckout())}/>);
	for (let i = 0; i < 3; i++)
		await screen.getByRole("button", { name: "Step forward" }).click();
	await openInspector(screen, "Events and evidence");
	const source = screen.getByRole("region", {
		name: "Recorded source data for event watchTimeout",
	});
	await expect.element(source).toBeVisible();
	expect(source.element().getAttribute("data-source-event-ids")).toBe("watchTimeout");
	expect(source.element().getAttribute("data-source-entity-ids")).toBe("client");
	expect(source.element().textContent).toContain("no acknowledgement recorded yet");
	expect(source.element().textContent).toContain("does not write or");
	await screen.getByText("Values and write history", { exact: true }).click();
	await userEvent.selectOptions(
		screen.getByRole("combobox", { name: "Inspect entity" }).element(), "client",
	);
	await screen.getByRole("textbox", { name: "Inspect path" }).fill('["timeout"]');
	await screen.getByRole("button", { name: "Inspect path" }).click();
	const selected = screen.getByRole("table", {
		name: "Previous and current modeled state at requested path",
	});
	expect(selected.element().textContent).toContain("Known: false");
	expect(view()?.textContent).toContain("No explicit write or presence change");
});

it("reveals optional authored message payload, escaped as data, without claiming persistence", async () => {
	const source = retryCheckout();
	const event = source.steps[0]!.events[0]!;
	if (event.type !== "message") throw new Error("invalid source fixture");
	event.payload = {
		note: "</script><script>injected()</script>",
		long: "B".repeat(200) + "tail",
	};
	const screen = await render(<ThroughlineGraphPlayer trace={compileArtifact(source)}/>);
	await screen.getByRole("button", { name: "Step forward" }).click();
	await openInspector(screen, "Events and evidence");
	const recorded = screen.getByRole("region", {
		name: "Recorded source data for event originalSent",
	});
	await expect.element(recorded).toBeVisible();
	expect(recorded.element().getAttribute("data-source-relation-ids")).toBe("request");
	expect(recorded.element().textContent).toContain("Payload:");
	expect(recorded.element().textContent).toContain("does not prove receipt");
	await recorded.getByRole("button", {
		name: /Show exact message payload for event originalSent/,
	}).click();
	const exactValue = screen.getByRole("region", {
		name: "Exact message payload for event originalSent",
	});
	expect(exactValue.element().querySelector("pre")?.textContent)
		.toContain("</script><script>injected()</script>");
	expect(view()?.querySelectorAll("script")).toHaveLength(0);
	expect(view()?.textContent).toContain("No explicit write or presence change");
});

it("bounds 1,000 claims × 100 cited events with independent page windows and source seeking", async () => {
	await page.viewport(390, 780);
	const screen = await render(<ThroughlineGraphPlayer
		trace={compileArtifact(claimHeavyInspection())} initialView="graph"/>);
	screen.getByRole("group", { name: "Visualization player" }).element().focus();
	await userEvent.keyboard("{End}");
	await expect.element(screen.getByRole("status")).toHaveTextContent("Step 101 of 101");
	await openInspector(screen, "Events and evidence");
	const focused = screen.getByRole("region", { name: "Focused source event" });
	await expect.element(focused).toBeVisible();
	expect(focused.element().textContent).toContain("Editorial claims (1000)");
	expect(focused.element().textContent).toContain("Showing 12 of 1000 authored claims");
	const cards = () => focused.element().querySelectorAll<HTMLLIElement>(
		".thl-v2-inspect-claim");
	const cited = () => focused.element().querySelectorAll<HTMLButtonElement>(
		".thl-v2-inspect-claim ul button[data-source-event-ids]");
	expect(cards()).toHaveLength(12);
	expect(cited()).toHaveLength(144);
	expect([...cards()].every(card => card.querySelectorAll(
		"ul button[data-source-event-ids]").length <= 12)).toBe(true);
	expect(cards()[0]?.getAttribute("data-source-claim-id")).toBe("claim0");
	expect(cards()[0]?.textContent).toContain("Modeled cited events: 100");

	await focused.getByRole("button", { name: "Next cited events for claim0" }).click();
	expect(cards()).toHaveLength(12);
	expect(cited()).toHaveLength(144);
	expect(cards()[0]?.querySelector('[data-source-event-ids="observation12"]'))
		.not.toBeNull();
	expect(cards()[0]?.querySelector('[data-source-event-ids="observation0"]')).toBeNull();

	await focused.getByRole("button", { name: "Next claims page" }).click();
	expect(cards()).toHaveLength(12);
	expect(cited()).toHaveLength(144);
	expect(cards()[0]?.getAttribute("data-source-claim-id")).toBe("claim12");
	await focused.getByRole("button", { name: "Previous claims page" }).click();
	expect(cards()).toHaveLength(12);
	expect(cards()[0]?.getAttribute("data-source-claim-id")).toBe("claim0");
	await focused.getByRole("button", { name: "Next claims page" }).click();
	await focused.getByRole("button", { name: "Next cited events for claim12" }).click();
	await focused.getByRole("button", {
		name: "Inspect event observation12 (step 14)",
	}).click();
	await expect.element(screen.getByRole("status")).toHaveTextContent("Step 14 of 101");
	expect(focused.element().getAttribute("data-source-event-ids")).toBe("observation12");
	expect(cards()).toHaveLength(12);
	expect(cited().length).toBeLessThanOrEqual(144);
	expect(view()?.textContent).toContain("1000");
	expect(view()?.textContent).toContain("87 cited event(s) are not yet");
	expect(document.querySelector(".thl-v2")!.scrollWidth)
		.toBeLessThanOrEqual(document.querySelector(".thl-v2")!.clientWidth);
}, 60_000);


it("shows retained cells for absent entities, including writes while absent and later presence", async () => {
	const source = distributedGraph();
	source.steps = [
		{ id: "queuedUpdate", label: "Update absent worker", events: [
			{ id: "queuedWrite", originId: "author", type: "write", entityId: "worker",
				path: [], value: { status: "known", value: null } },
			{ id: "stillAbsent", originId: "author", type: "topology", target: "entity",
				targetId: "worker", present: false },
		] },
		{ id: "activate", label: "Activate worker", events: [
			{ id: "activateWorker", originId: "author", type: "topology", target: "entity",
				targetId: "worker", present: true },
		] },
	];
	source.claims = [];
	const screen = await render(<ThroughlineGraphPlayer trace={compileArtifact(source)} initialView="state-table"/>);
	const worker = () => document.querySelector('.state-view tr[data-source-entity-ids="worker"]')!;
	expect(worker().textContent).toContain("Not present");
	expect(worker().textContent).toContain("Retained modeled cell");
	await screen.getByRole("button", { name: "Step forward" }).click();
	expect(worker().textContent).toContain("Not present");
	expect(worker().textContent).toContain("Known: null");
	expect(worker().textContent).toContain("queuedWrite");
	await screen.getByRole("button", { name: "Worker", exact: true }).click();
	const panel = screen.getByRole("complementary", { name: "Workflow inspector" });
	expect(panel.element().textContent).toContain("Retained modeled cell");
	expect(panel.element().textContent).toContain("Known: null");
	await screen.getByRole("button", { name: "Close inspector" }).click();
	await screen.getByRole("button", { name: "Inspect event stillAbsent" }).click();
	expect(panel.element().querySelector("h3")?.textContent).toContain("presence asserted absent (unchanged)");
	expect(panel.element().querySelector("h3")?.textContent).not.toContain("became absent");
	await screen.getByRole("button", { name: "Close inspector" }).click();
	await screen.getByRole("button", { name: "Step forward" }).click();
	expect(worker().textContent).not.toContain("Not present");
	expect(worker().textContent).not.toContain("Retained modeled cell");
	expect(worker().textContent).toContain("Known: null");
});
