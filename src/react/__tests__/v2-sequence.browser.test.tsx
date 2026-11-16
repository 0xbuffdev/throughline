import { expect, it } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { compileArtifact } from "../../v2/compiler.js";
import { retryCheckout } from "../../__tests__/v2-sequence-fixture.js";
import { ThroughlineGraphPlayer } from "../graph-player.js";
import "../../styles/throughline.css";

const artifact = () => compileArtifact(retryCheckout());
const evidence = (id: string): HTMLTableRowElement | null =>
	document.querySelector<HTMLTableRowElement>(
		'.thl-v2-sequence-log tr[data-source-event-ids="' + id + '"]');
const correlation = (messageId: string): HTMLLIElement | null =>
	document.querySelector<HTMLLIElement>(
		'.thl-v2-sequence-correlations li[data-message-id="' + messageId + '"]');
const phase = (messageId: string, name: string): string | undefined =>
	correlation(messageId)?.querySelector('[data-phase="' + name + '"]')?.textContent?.trim();

async function openEvidence(screen: Awaited<ReturnType<typeof render>>) {
 const trigger = screen.getByRole("button", { name: "Inspect", exact: true });
 if (trigger.element().getAttribute("aria-pressed") !== "true") await trigger.click();
 const details = document.querySelector<HTMLDetailsElement>(".evidence-note");
 if (details && !details.open)
  await screen.getByText("CAUSAL EVIDENCE", { exact: true }).click();
}
async function openSequence(screen: Awaited<ReturnType<typeof render>>) {
 await screen.getByRole("tab", { name: "Sequence" }).click();
 await openEvidence(screen);
 await expect.element(screen.getByRole("region", { name: "Message sequence evidence" }))
  .toBeVisible();
}

it("uses artifact hint priority and automatic message choice on initial render", async () => {
	const screen = await render(<ThroughlineGraphPlayer trace={artifact()} />);
	await expect.element(screen.getByRole("region", { name: "Message sequence evidence" }))
		.toBeVisible();
	await expect.element(screen.getByRole("tab", { name: "Sequence" })).toHaveAttribute("aria-selected", "true");

	const preferred = retryCheckout();
	preferred.views = [
		{ kind: "sequence", priority: 9 },
		{ kind: "state-table", priority: 0 },
		{ kind: "graph", priority: 5 },
	];
	await screen.rerender(<ThroughlineGraphPlayer trace={compileArtifact(preferred)} />);
	await expect.element(screen.getByRole("region", { name: "State and event table" }))
		.toBeVisible();
	await expect.element(screen.getByRole("tab", { name: "State" })).toHaveAttribute("aria-selected", "true");
 await screen.getByRole("tab", { name: "Graph" }).click(); // manual choice wins
 await expect.element(screen.getByRole("img", { name: "Source-linked graph at current frame" })).toBeVisible();
 await screen.getByRole("button", { name: "Step forward" }).click();
 await expect.element(screen.getByRole("status")).toHaveTextContent("Step 2 of 10");
 await expect.element(screen.getByRole("tab", { name: "Graph" })).toHaveAttribute("aria-selected", "true");

	const tied = retryCheckout();
	tied.views = [
		{ kind: "state-table", priority: 1 },
		{ kind: "graph", priority: 1 },
		{ kind: "sequence", priority: 1 },
	];
	await screen.rerender(<ThroughlineGraphPlayer trace={compileArtifact(tied)} />);
	await expect.element(screen.getByRole("region", { name: "Message sequence evidence" }))
		.toBeVisible();
	await expect.element(screen.getByRole("status")).toHaveTextContent("Step 1 of 10");
	await expect.element(screen.getByRole("tab", { name: "Sequence" })).toHaveAttribute("aria-selected", "true");
});

it("does not flag receipt before send within the same atomic step", async () => {
	const source = retryCheckout();
	source.steps = [
		{ id: "atomic", label: "Display order is not chronology", events: [
			{ id: "receipt", originId: "observer", type: "message",
				relationId: "request", messageId: "sameStep", phase: "received" },
			{ id: "send", originId: "author", type: "message",
				relationId: "request", messageId: "sameStep", phase: "sent" },
		] },
	];
	const screen = await render(
		<ThroughlineGraphPlayer trace={compileArtifact(source)} initialView="sequence"/>,
	);
	await screen.getByRole("button", { name: "Step forward" }).click();
	await expect.element(screen.getByRole("status")).toHaveTextContent("Step 2 of 2");
 await openEvidence(screen);
 expect(evidence("receipt")?.getAttribute("data-message-phase")).toBe("received");
	expect(evidence("receipt")?.textContent).not.toContain("No sent modeled through this step");
	expect(phase("sameStep", "sent")).toBe("sent: 1");
	expect(phase("sameStep", "received")).toBe("received: 1");
	expect(correlation("sameStep")?.getAttribute("data-source-event-ids"))
		.toBe("receipt send");
});

it("shows modeled phases through seeking, no future or imagined acknowledgement", async () => {
	const screen = await render(<ThroughlineGraphPlayer trace={artifact()} />);
	await openSequence(screen);
	await expect.element(screen.getByText("No modeled events through this frame.")).toBeVisible();
	expect(evidence("originalSent")).toBeNull();
	const next = screen.getByRole("button", { name: "Step forward" });
	await next.click();
	await expect.element(screen.getByRole("status")).toHaveTextContent("Step 2 of 10");
	expect(evidence("originalSent")?.getAttribute("data-message-phase")).toBe("sent");
	expect(evidence("originalReceived")).toBeNull();
	expect(phase("order42", "sent")).toBe("sent: 1");
	expect(phase("order42", "acknowledged")).toBe("acknowledged: not modeled");
	await next.click();
	await expect.element(screen.getByRole("status")).toHaveTextContent("Step 3 of 10");
	expect(evidence("originalReceived")?.getAttribute("data-message-phase")).toBe("received");
	expect(evidence("originalProcessed")?.getAttribute("data-message-phase")).toBe("processed");
	expect(evidence("originalReceived")?.getAttribute("data-source-relation-ids")).toBe("request");
	expect(evidence("originalProcessed")?.textContent).toContain("compute (computed)");
	expect(phase("order42", "received")).toBe("received: 1");
	expect(phase("order42", "processed")).toBe("processed: 1");
	expect(phase("order42", "acknowledged")).toBe("acknowledged: not modeled");
	expect(evidence("retrySent")).toBeNull();
	await expect.element(screen.getByText(/not proof that one was lost/)).toBeVisible();
});

it("distinguishes explicit timeout state/observation from a fifth message phase", async () => {
	const screen = await render(<ThroughlineGraphPlayer trace={artifact()} />);
	await openSequence(screen);
	const next = screen.getByRole("button", { name: "Step forward" });
	for (let i = 0; i < 3; i++) await next.click();
	expect(evidence("watchTimeout")?.getAttribute("data-evidence-type")).toBe("observation");
	expect(evidence("watchTimeout")?.getAttribute("data-message-phase")).toBeNull();
	expect(evidence("watchTimeout")?.textContent).toContain("not a message phase");
	expect(phase("order42", "acknowledged")).toBe("acknowledged: not modeled");
	await next.click();
	expect(evidence("timeoutWrite")?.getAttribute("data-evidence-type")).toBe("write");
	expect(evidence("timeoutWrite")?.getAttribute("data-current-frame")).toBe("true");
	expect(evidence("timeoutWrite")?.getAttribute("data-message-phase")).toBeNull();
	const allowed = ["sent", "received", "acknowledged", "processed"];
	const displayed = [...document.querySelectorAll<HTMLTableRowElement>(
		".thl-v2-sequence-log tr[data-message-phase]")];
	expect(displayed.every(row =>
		allowed.includes(row.getAttribute("data-message-phase") ?? ""))).toBe(true);
	expect(displayed.some(row => row.getAttribute("data-message-phase") === "timeout")).toBe(false);
});

it("correlates retries and isolated acknowledgements without claiming original ack", async () => {
	const screen = await render(<ThroughlineGraphPlayer trace={artifact()} />);
	await openSequence(screen);
	const next = screen.getByRole("button", { name: "Step forward" });
	for (let i = 0; i < 7; i++) await next.click();
	await expect.element(screen.getByRole("status")).toHaveTextContent("Step 8 of 10");
	expect(correlation("order42")?.getAttribute("data-source-event-ids"))
		.toBe("originalSent originalReceived originalProcessed");
	expect(correlation("order42retry")?.getAttribute("data-source-event-ids"))
		.toBe("retrySent retryReceived retryAck");
	expect(phase("order42", "acknowledged")).toBe("acknowledged: not modeled");
	expect(phase("order42retry", "acknowledged")).toBe("acknowledged: 1");
	await next.click();
	expect(evidence("isolatedAck")?.getAttribute("data-message-phase")).toBe("acknowledged");
	expect(evidence("isolatedAck")?.textContent).toContain("No sent modeled through this step");
	expect(phase("orphan", "sent")).toBe("sent: not modeled");
	await next.click();
	expect(phase("order42", "received")).toBe("received: 2");
	expect(correlation("order42")?.getAttribute("data-source-event-ids"))
		.toContain("repeatReceived");
	expect(evidence("repeatReceived")?.getAttribute("data-source-event-ids"))
		.toBe("repeatReceived");
});

it("preserves frame and source identity switching graph → sequence → graph", async () => {
	const screen = await render(<ThroughlineGraphPlayer trace={artifact()} initialView="graph" />);
	const next = screen.getByRole("button", { name: "Step forward" });
	await next.click();
	await next.click();
	await expect.element(screen.getByRole("status")).toHaveTextContent("Step 3 of 10");
	await screen.getByRole("button", { name: "Select Gateway" }).click();
	expect(document.querySelector(".inspector .entity-heading")?.textContent).toContain("Gateway");
	await openSequence(screen);
	await expect.element(screen.getByRole("status")).toHaveTextContent("Step 3 of 10");
	expect(document.querySelector('.sequence-head [data-source-entity-ids="gateway"]')
		?.getAttribute("aria-pressed")).toBe("true");
	await screen.getByRole("button", { name: /Client \(present at frame\)/ }).click();
	expect(document.querySelector(".inspector .entity-heading")?.textContent).toContain("Client");
	await screen.getByRole("tab", { name: "Graph" }).click();
	await expect.element(screen.getByRole("status")).toHaveTextContent("Step 3 of 10");
	expect(document.querySelector('[data-node="client"]')?.getAttribute("aria-pressed"))
		.toBe("true");
	expect(document.querySelector('[data-node="gateway"]')?.getAttribute("aria-pressed"))
		.toBe("false");
	await screen.getByRole("tab", { name: "State" }).click();
	await expect.element(screen.getByRole("region", { name: "State and event table" }))
		.toBeVisible();
	await expect.element(screen.getByText("Selected: Client")).toBeVisible();
});

it("works at mobile width and retains chronological source rows", async () => {
	await page.viewport(375, 800);
	const screen = await render(<ThroughlineGraphPlayer trace={artifact()} />);
	await openSequence(screen);
	const root = document.querySelector(".thl-v2")!;
	expect(root.scrollWidth).toBeLessThanOrEqual(root.clientWidth);
	screen.getByRole("group", { name: "Visualization player" }).element().focus();
	await userEvent.keyboard("{End}");
	await expect.element(screen.getByRole("status")).toHaveTextContent("Step 10 of 10");
	expect(evidence("repeatReceived")?.getAttribute("data-current-frame")).toBe("true");
	await expect.element(screen.getByRole("region", { name: "Sequence evidence timeline" }))
		.toBeVisible();
	expect(phase("order42", "received")).toBe("received: 2");
	const events = document.querySelectorAll('.thl-v2-sequence-log tr[data-source-event-ids]');
	expect(events).toHaveLength(11);
	expect(root.scrollWidth).toBeLessThanOrEqual(root.clientWidth);
});

it("mounts at most 120 correlation cards for hundreds of distinct message IDs", async () => {
	const source = retryCheckout();
	source.steps = Array.from({ length: 360 }, (_, n) => ({
		id: "step" + n, label: "Step " + n, events: [{
			id: "event" + n, originId: "author", type: "message" as const,
			relationId: "request", messageId: "unique" + n, phase: "sent" as const,
		}],
	}));
	const screen = await render(
		<ThroughlineGraphPlayer trace={compileArtifact(source)} initialView="sequence" />,
	);
	screen.getByRole("group", { name: "Visualization player" }).element().focus();
	await userEvent.keyboard("{End}");
	await expect.element(screen.getByRole("status")).toHaveTextContent("Step 361 of 361");
	const cards = () => document.querySelectorAll(
		".thl-v2-sequence-correlations li[data-message-id]");
	expect(cards()).toHaveLength(120);
	expect(correlation("unique359")?.getAttribute("data-source-event-ids")).toBe("event359");
	expect(correlation("unique0")).toBeNull();
	await expect.element(screen.getByText(/Showing 120 of 360 message ID/)).toBeVisible();
	await screen.getByRole("button", { name: "Show earlier message IDs" }).click();
	expect(cards()).toHaveLength(120);
	expect(correlation("unique120")?.getAttribute("data-source-event-ids")).toBe("event120");
	expect(correlation("unique0")).toBeNull();
	expect(correlation("unique359")).toBeNull();
	await screen.getByRole("button", { name: "Show earlier message IDs" }).click();
	expect(cards()).toHaveLength(120);
	expect(correlation("unique0")?.getAttribute("data-source-relation-ids")).toBe("request");
	expect(phase("unique0", "sent")).toBe("sent: 1");
	expect(correlation("unique359")).toBeNull();
	await expect.element(screen.getByRole("button", { name: "Show earlier message IDs" }))
		.toBeDisabled();
	await screen.getByRole("button", { name: "Show newer message IDs" }).click();
	expect(cards()).toHaveLength(120);
	expect(correlation("unique120")?.getAttribute("data-source-event-ids")).toBe("event120");
	await screen.getByRole("button", { name: "Show newer message IDs" }).click();
	expect(cards()).toHaveLength(120);
	expect(phase("unique359", "sent")).toBe("sent: 1");
	expect(document.querySelectorAll(".thl-v2-sequence-log tr[data-source-event-ids]"))
		.toHaveLength(120); // independent event paging
});

it("progressively reveals earlier rows without losing source evidence", async () => {
	const source = retryCheckout();
	source.steps = Array.from({ length: 160 }, (_, n) => ({
		id: "step" + n, label: "Step " + n, events: [{
			id: "event" + n, originId: "author", type: "message" as const,
			relationId: "request", messageId: "batch", phase: "sent" as const,
		}],
	}));
	const compiled = compileArtifact(source);
	const screen = await render(<ThroughlineGraphPlayer trace={compiled} />);
	await openSequence(screen);
	screen.getByRole("group", { name: "Visualization player" }).element().focus();
	await userEvent.keyboard("{End}");
	await expect.element(screen.getByRole("status")).toHaveTextContent("Step 161 of 161");
	const rows = () => document.querySelectorAll(
		".thl-v2-sequence-log tr[data-source-event-ids]");
	expect(rows()).toHaveLength(120);
	expect(evidence("event0")).toBeNull();
	expect(evidence("event159")).not.toBeNull();
	expect(phase("batch", "sent")).toBe("sent: 160");
	await page.locator(".thl-v2-sequence-log").getByRole("button", { name: "Show earlier evidence" }).click();
	expect(rows()).toHaveLength(160);
	expect(evidence("event0")).not.toBeNull();
	expect(evidence("event159")).not.toBeNull();
});
