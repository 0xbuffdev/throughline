import { expect, it } from "vitest";
import { render } from "vitest-browser-react";
import { userEvent } from "vitest/browser";
import { retryCheckout } from "../../__tests__/v2-sequence-fixture.js";
import { EXAMPLES } from "../../examples.js";
import { compileArtifact } from "../../v2/compiler.js";
import { GraphPlayer } from "../graph-player.js";
import { MermaidPlayerDiagram } from "../mermaid/player-diagram.js";
import { graphWorkload } from "./mermaid-proof/workloads.js";
import "../../styles/throughline.css";

it("keeps three labeled Sequence lanes fixed through a send, receipt and reverse seek", async () => {
	const artifact = retryCheckout();
	artifact.steps.push({ id: "ledgerSend", label: "Send to ledger", events: [
		{ id: "ledgerSent", originId: "author", type: "message",
			relationId: "write", messageId: "ledgerMessage", phase: "sent" },
	] });
	const trace = compileArtifact(artifact);
	const screen = await render(<div style={{ width: 375 }}>
		<GraphPlayer trace={trace} initialView="sequence" DiagramRenderer={MermaidPlayerDiagram}/>
	</div>);
	const diagram = screen.getByRole("region", { name: "Source-linked sequence at current frame" });
	await expect.element(diagram).toBeVisible();
	const lanes = () => [...diagram.element().querySelectorAll(".actor-line")].map(line =>
		[line.getAttribute("data-id"), line.getAttribute("x1")]);
	const initial = lanes();
	expect(initial).toHaveLength(3);
	await expect.element(screen.getByRole("button", { name: "Inspect participant Ledger" })).toBeInTheDocument();
	expect(diagram.element().querySelector(".messageText, .noteText")).toBeNull();

	await screen.getByRole("button", { name: "Step forward" }).click();
	await expect.poll(() => diagram.element().querySelector("[data-thl-transfer] text")?.textContent)
		.toBe("Checkout request · order42");
	expect(lanes()).toEqual(initial);
	const route = diagram.element().querySelector(".messageLine0");
	expect(route?.getAttribute("data-from")).toBe("thl_node_0");
	expect(route?.getAttribute("data-to")).toBe("thl_node_1");
	expect(Number(route?.getAttribute("x2"))).toBeGreaterThan(Number(route?.getAttribute("x1")));

	await screen.getByRole("button", { name: "Step forward" }).click();
	await expect.poll(() => diagram.element().querySelector(".noteText")?.textContent).toContain("received");
	expect(lanes()).toEqual(initial);
	expect(diagram.element().querySelectorAll(".messageLine0")).toHaveLength(1);
	expect(diagram.element().querySelector("[data-thl-transfer]")).toBeNull();

	await screen.getByRole("button", { name: "Step back" }).click();
	await expect.poll(() => diagram.element().querySelector(".noteText")).toBeNull();
	expect(lanes()).toEqual(initial);
	expect(diagram.element().querySelector("[data-thl-transfer]")).toBeNull();
	await screen.getByRole("button", { name: "Changes and evidence", exact: true }).click();
	await expect.element(screen.getByRole("region", { name: "Source-event log and correlation details" })).toBeVisible();
	await userEvent.keyboard("{Escape}");
	await expect.element(screen.getByRole("button", { name: "Inspect", exact: true })).toHaveFocus();
}, 60_000);

it("updates Graph transfer paint without relayout and opens the exact source in Inspect", async () => {
	const trace = compileArtifact(EXAMPLES.find(example => example.id === "checkout")!.artifact);
	const screen = await render(<div style={{ width: 720 }}>
		<GraphPlayer trace={trace} initialView="graph" DiagramRenderer={MermaidPlayerDiagram}/>
	</div>);
	const diagram = screen.getByRole("group", { name: "Source-linked graph at current frame" });
	await expect.element(diagram).toBeVisible();
	const route = screen.getByRole("button", { name: "Inspect relation Checkout request" });
	const path = route.element();
	const geometry = path.getAttribute("d");
	await screen.getByRole("button", { name: "Step forward" }).click();
	await expect.poll(() => diagram.element().querySelector("[data-thl-transfer] text")?.textContent)
		.toBe("Checkout request");
	expect(route.element()).toBe(path);
	expect(path.getAttribute("d")).toBe(geometry);
	await expect.element(route).toHaveAttribute("data-thl-active", "");
	(path as SVGElement).focus();
	await userEvent.keyboard("{Enter}");
	await expect.element(screen.getByRole("complementary", { name: "Source inspector" })).toBeVisible();
	const source = screen.container.querySelector(".diagram-source");
	expect(source?.getAttribute("data-source-relation-ids")).toBe("request");
	expect(source?.getAttribute("data-source-event-ids")).toBe("requestSent");
}, 60_000);

it("shows supported tabs and authored focus for factorial without fabricating transfers", async () => {
	const trace = compileArtifact(EXAMPLES.find(example => example.id === "factorial")!.artifact);
	const screen = await render(<div style={{ width: 375 }}>
		<GraphPlayer trace={trace} DiagramRenderer={MermaidPlayerDiagram}/>
	</div>);
	const diagram = screen.getByRole("group", { name: "Source-linked graph at current frame" });
	await expect.element(diagram).toBeVisible();
	expect(screen.getByRole("tablist").element().textContent).toBe("GraphState");
	await screen.getByRole("button", { name: "Step forward" }).click();
	await expect.element(screen.getByRole("button", { name: "Inspect entity Modeled call stack" }))
		.toHaveAttribute("data-thl-focused", "");
	expect(diagram.element().querySelector("[data-thl-transfer]")).toBeNull();
	await screen.getByRole("tab", { name: "State" }).click();
	await expect.element(screen.getByRole("region", { name: "State and event table" })).toBeVisible();
}, 60_000);

it("uses the native state and evidence fallback for an oversized graph", async () => {
	const trace = compileArtifact(graphWorkload(65, 66));
	const screen = await render(<GraphPlayer trace={trace} initialView="graph" DiagramRenderer={MermaidPlayerDiagram}/>);
	await expect.element(screen.getByText("This diagram exceeds the preview display limit.")).toBeVisible();
	await expect.element(screen.getByRole("region", { name: "State and event table" })).toBeVisible();
	await screen.getByRole("button", { name: "Changes and evidence", exact: true }).click();
	await expect.element(screen.getByRole("complementary", { name: "Entity inspector" })).toBeVisible();
}, 60_000);
