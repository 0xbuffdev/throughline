import { expect, it } from "vitest";
import { render } from "vitest-browser-react";
import { compileArtifact } from "../../v2/compiler.js";
import { EXAMPLES } from "../../examples.js";
import { ThroughlineGraphPlayer } from "../graph-player.js";
import "../../styles/throughline.css";

it.each(EXAMPLES)("renders $title with the same native schema-2 player and exact frame count", async example => {
	const trace = compileArtifact(example.artifact);
	const screen = await render(
		<ThroughlineGraphPlayer
			key={example.id}
			trace={trace}
			title={example.title}
			narration={false}
		/>,
	);
	await expect.element(screen.getByRole("group", { name: "Visualization player" })).toBeVisible();
	await expect.element(screen.getByRole("heading", { name: example.title })).toBeVisible();
	await expect.element(screen.getByRole("status"))
		.toHaveTextContent("Step 1 of " + trace.frames.length);
	const forward = screen.getByRole("button", { name: "Step forward" });
	await forward.click();
	await expect.element(screen.getByRole("status"))
		.toHaveTextContent("Step 2 of " + trace.frames.length);
	expect(trace.frames[1]?.eventIds)
		.toEqual(example.artifact.steps[0].events.map(event => event.id));
});

it("shows exact checkout message phases and persistence evidence as the user steps forward", async () => {
	const example = EXAMPLES.find(item => item.id === "checkout")!;
	const trace = compileArtifact(example.artifact);
	const screen = await render(
		<ThroughlineGraphPlayer trace={trace} initialView="sequence" />,
	);
	const region = screen.getByRole("region", { name: "Message sequence evidence", exact: true });
	await expect.element(region).toBeVisible();
 await screen.getByRole("button", { name: "Inspect", exact: true }).click();
 await screen.getByText("Source details", { exact: true }).click();
 const next = screen.getByRole("button", { name: "Step forward" });
	let frame = 0;
	const advanceTo = async (stepId: string) => {
		const target = trace.frames.findIndex(item => item.id === stepId);
		expect(target).toBeGreaterThan(frame);
		while (frame < target) {
			await next.click();
			frame++;
		}
		await expect.element(screen.getByRole("status"))
			.toHaveTextContent("Step " + (frame + 1) + " of " + trace.frames.length);
	};
	const row = (eventId: string) =>
		document.querySelector<HTMLTableRowElement>(
			'.thl-v2-sequence-log tr[data-source-event-ids="' + eventId + '"]',
		);
	const counts = (messageId: string, phase: string) =>
		document.querySelector<HTMLSpanElement>(
			'.thl-v2-sequence-correlations [data-message-id="' + messageId +
			'"] [data-phase="' + phase + '"]',
		)?.textContent;

	await advanceTo("sendCharge");
	expect(row("chargeFirstSent")?.getAttribute("data-message-phase")).toBe("sent");
	expect(counts("paymentFirst", "sent")).toBe("sent: 1");
	expect(counts("paymentFirst", "received")).toContain("not modeled");
	expect(counts("paymentFirst", "processed")).toContain("not modeled");
	expect(counts("paymentFirst", "acknowledged")).toContain("not modeled");
	expect(row("chargeFirstReceived")).toBeNull();

	await advanceTo("providerCharge");
	expect(row("chargeFirstReceived")?.getAttribute("data-message-phase")).toBe("received");
	expect(row("chargeFirstProcessed")?.getAttribute("data-message-phase")).toBe("processed");
	expect(row("providerCharged")?.getAttribute("data-evidence-type")).toBe("write");
	expect(counts("paymentFirst", "received")).toBe("received: 1");
	expect(counts("paymentFirst", "processed")).toBe("processed: 1");
	expect(counts("paymentFirst", "acknowledged")).toContain("not modeled");

	await advanceTo("timeout");
	expect(row("workerTimeout")?.getAttribute("data-evidence-type")).toBe("write");
	expect(row("workerTimeout")?.getAttribute("data-message-phase")).toBeNull();
	expect(counts("paymentFirst", "acknowledged")).toContain("not modeled");
	expect(document.querySelector('[data-message-id="timeout"]')).toBeNull();

	await advanceTo("deduplicate");
	expect(row("chargeRetrySent")?.getAttribute("data-message-phase")).toBe("sent");
	expect(row("chargeRetryReceived")?.getAttribute("data-message-phase")).toBe("received");
	expect(row("chargeRetryProcessed")?.getAttribute("data-message-phase")).toBe("processed");
	expect(row("providerDedup")?.getAttribute("data-evidence-type")).toBe("write");
	expect(counts("paymentRetry", "sent")).toBe("sent: 1");
	expect(counts("paymentRetry", "received")).toBe("received: 1");
	expect(counts("paymentRetry", "processed")).toBe("processed: 1");
	expect(counts("paymentRetry", "acknowledged")).toContain("not modeled");

	await advanceTo("sendReply");
	expect(counts("confirmedResult", "sent")).toBe("sent: 1");
	expect(counts("confirmedResult", "received")).toContain("not modeled");
	expect(row("outcomeConfirmed")).toBeNull();

	await advanceTo("receiveReply");
	expect(row("resultReceived")?.getAttribute("data-message-phase")).toBe("received");
	expect(row("outcomeConfirmed")?.getAttribute("data-evidence-type")).toBe("write");
	expect(counts("confirmedResult", "received")).toBe("received: 1");
	expect(counts("confirmedResult", "acknowledged")).toContain("not modeled");

	await advanceTo("persistReceipt");
	expect(row("receiptPaid")?.getAttribute("data-evidence-type")).toBe("write");
	expect(row("orderPaid")).toBeNull();
	await advanceTo("markOrder");
	expect(row("orderPaid")?.getAttribute("data-evidence-type")).toBe("write");
	await advanceTo("customerReceives");
	expect(row("customerConfirmed")?.getAttribute("data-evidence-type")).toBe("write");
	expect(row("noticeReceived")?.getAttribute("data-message-phase")).toBe("received");
	expect(document.querySelectorAll('.thl-v2-sequence-log tr[data-message-phase="acknowledged"]'))
		.toHaveLength(0);
	expect(document.querySelectorAll('.thl-v2-sequence-log tr[data-source-event-ids]'))
		.toHaveLength(example.artifact.steps.reduce((sum, step) => sum + step.events.length, 0));
});
